require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const db = new sqlite3.Database(path.join(__dirname, '..', 'data', 'shortvid.db'));

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      channel_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      file_path TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  });
}

initDatabase();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 14 }
  })
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => done(err, user));
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/google/callback`
      },
      (accessToken, refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        const displayName = profile.displayName || 'Tvůrce';

        db.get('SELECT * FROM users WHERE google_id = ?', [profile.id], (err, existingUser) => {
          if (err) return done(err);
          if (existingUser) return done(null, existingUser);

          db.run(
            'INSERT INTO users (google_id, email, display_name, channel_name) VALUES (?, ?, ?, ?)',
            [profile.id, email, displayName, `${displayName} Channel`],
            function insertUser(insertErr) {
              if (insertErr) return done(insertErr);
              db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (getErr, newUser) => done(getErr, newUser));
            }
          );
        });
      }
    )
  );
}

app.use(passport.initialize());
app.use(passport.session());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Nahrát lze pouze video soubory.'));
  },
  limits: { fileSize: 100 * 1024 * 1024 }
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect('/');
}

app.get('/', (req, res) => {
  db.all(
    `SELECT videos.id, videos.title, videos.description, videos.file_path, videos.uploaded_at, users.channel_name
     FROM videos
     JOIN users ON videos.user_id = users.id
     ORDER BY videos.uploaded_at DESC`,
    [],
    (err, videos) => {
      if (err) return res.status(500).send('Chyba načítání videí.');
      res.render('index', { user: req.user, videos, googleReady: Boolean(process.env.GOOGLE_CLIENT_ID) });
    }
  );
});

app.get('/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Google OAuth není nakonfigurován.');
  }
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/',
    successRedirect: '/dashboard'
  })
);

app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

app.get('/dashboard', ensureAuth, (req, res) => {
  db.all('SELECT * FROM videos WHERE user_id = ? ORDER BY uploaded_at DESC', [req.user.id], (err, myVideos) => {
    if (err) return res.status(500).send('Chyba dashboardu.');
    res.render('dashboard', { user: req.user, myVideos, error: null, success: null });
  });
});

app.post('/channel', ensureAuth, (req, res) => {
  const channelName = (req.body.channelName || '').trim();
  if (!channelName) return res.redirect('/dashboard');

  db.run('UPDATE users SET channel_name = ? WHERE id = ?', [channelName, req.user.id], (err) => {
    if (err) return res.status(500).send('Nepodařilo se upravit kanál.');
    res.redirect('/dashboard');
  });
});

app.post('/upload', ensureAuth, upload.single('videoFile'), (req, res) => {
  if (!req.file) return res.status(400).send('Video je povinné.');

  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();

  if (!title) {
    fs.unlinkSync(req.file.path);
    return res.status(400).send('Název videa je povinný.');
  }

  const filePath = `/public/uploads/${req.file.filename}`;

  db.run(
    'INSERT INTO videos (user_id, title, description, file_path) VALUES (?, ?, ?, ?)',
    [req.user.id, title, description, filePath],
    (err) => {
      if (err) return res.status(500).send('Nahrání videa se nezdařilo.');
      res.redirect('/dashboard');
    }
  );
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).send(`Chyba uploadu: ${err.message}`);
  }
  if (err) {
    return res.status(400).send(err.message || 'Nečekaná chyba.');
  }
  return next();
});

app.listen(PORT, () => {
  console.log(`ShortVid běží na ${BASE_URL}`);
});
