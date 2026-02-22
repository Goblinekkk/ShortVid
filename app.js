const STORAGE_KEYS = {
  user: "shortvid_user",
  videos: "shortvid_videos"
};

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const DB_NAME = "shortvid-db";
const DB_STORE = "videoBlobs";

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function putBlob(id, blob) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(id);
    request.onsuccess = () => resolve(request.result?.blob || null);
    request.onerror = () => reject(request.error);
  });
}

function decodeJwt(token) {
  const payload = token.split(".")[1];
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join("")
  );
  return JSON.parse(decoded);
}

function getUser() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || "null");
}

function setUser(user) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

function getVideos() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || "[]");
}

function setVideos(videos) {
  localStorage.setItem(STORAGE_KEYS.videos, JSON.stringify(videos));
}

function byNewest(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function renderWelcome() {
  const user = getUser();
  const welcome = document.getElementById("welcome");

  if (!user) {
    welcome.innerHTML = `
      <h2>Vítej na ShortVid</h2>
      <p>Přihlas se přes Google a nahraj svoje první short video.</p>
    `;
    return;
  }

  welcome.innerHTML = `
    <h2>Ahoj, ${user.name}</h2>
    <p>Kanál: <strong>${user.channelName}</strong></p>
  `;
}

function renderAuth() {
  const authArea = document.getElementById("authArea");
  const user = getUser();
  authArea.innerHTML = "";

  if (user) {
    const button = document.createElement("button");
    button.textContent = "Odhlásit";
    button.onclick = () => {
      localStorage.removeItem(STORAGE_KEYS.user);
      renderAll();
    };
    authArea.append(button);
    return;
  }

  const config = window.SHORTVID_CONFIG || {};
  const hasClientId =
    !!config.googleClientId && !config.googleClientId.startsWith("YOUR_");

  if (hasClientId && window.google?.accounts?.id) {
    const gDiv = document.createElement("div");
    authArea.append(gDiv);
    google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: ({ credential }) => {
        const profile = decodeJwt(credential);
        setUser({
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          avatar: profile.picture,
          channelName: `${profile.given_name || profile.name} Channel`
        });
        renderAll();
      }
    });
    google.accounts.id.renderButton(gDiv, {
      theme: "outline",
      size: "large",
      text: "signin_with"
    });
  } else {
    const demoBtn = document.createElement("button");
    demoBtn.textContent = "Pokračovat jako demo účet";
    demoBtn.onclick = () => {
      setUser({
        id: "demo-user",
        name: "Demo User",
        email: "demo@local",
        avatar: "",
        channelName: "Demo Channel"
      });
      renderAll();
    };
    authArea.append(demoBtn);
  }
}

function renderDashboard() {
  const user = getUser();
  const dashboard = document.getElementById("dashboard");
  const channelInput = document.getElementById("channelName");

  if (!user) {
    dashboard.classList.add("hidden");
    return;
  }

  dashboard.classList.remove("hidden");
  channelInput.value = user.channelName;
}

async function renderFeed() {
  const feed = document.getElementById("feed");
  const videos = getVideos().sort(byNewest);

  if (!videos.length) {
    feed.innerHTML = "<p>Zatím tu nejsou žádná videa.</p>";
    return;
  }

  const cards = await Promise.all(
    videos.map(async (video) => {
      const blob = await getBlob(video.blobId);
      if (!blob) return "";
      const url = URL.createObjectURL(blob);

      return `
        <article class="video-card">
          <video controls preload="metadata" src="${url}"></video>
          <h3>${video.title}</h3>
          <p>${video.channelName}</p>
          <small>${new Date(video.createdAt).toLocaleString("cs-CZ")}</small>
        </article>
      `;
    })
  );

  feed.innerHTML = cards.filter(Boolean).join("");
}

function setupForms() {
  const channelForm = document.getElementById("channelForm");
  const uploadForm = document.getElementById("uploadForm");

  channelForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = getUser();
    if (!user) return;

    const channelName = document.getElementById("channelName").value.trim();
    if (!channelName) return;

    setUser({ ...user, channelName });
    renderAll();
  });

  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = getUser();
    if (!user) return;

    const title = document.getElementById("videoTitle").value.trim();
    const fileInput = document.getElementById("videoFile");
    const file = fileInput.files?.[0];

    if (!file || !file.type.startsWith("video/")) {
      alert("Vyber validní video soubor.");
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      alert("Video je moc velké (max 50 MB).");
      return;
    }

    const blobId = crypto.randomUUID();
    await putBlob(blobId, file);

    const videos = getVideos();
    videos.push({
      id: crypto.randomUUID(),
      blobId,
      ownerId: user.id,
      channelName: user.channelName,
      title,
      createdAt: new Date().toISOString()
    });
    setVideos(videos);

    uploadForm.reset();
    await renderFeed();
  });
}

function renderAll() {
  renderAuth();
  renderWelcome();
  renderDashboard();
  renderFeed();
}

window.addEventListener("DOMContentLoaded", () => {
  setupForms();
  renderAll();
});
