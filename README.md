# ShortVid

Jednoduchá platforma na short videa:
- uživatel se přihlásí přes Google účet,
- automaticky se mu vytvoří kanál,
- v dashboardu může upravit název kanálu,
- může nahrávat vlastní krátká videa,
- veřejná homepage ukazuje feed nahraných videí.

## Spuštění

```bash
npm install
cp .env.example .env
# doplň GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
npm run dev
```

Otevři `http://localhost:3000`.

## Google OAuth nastavení

1. V Google Cloud Console vytvoř OAuth 2.0 Client ID (Web application).
2. Nastav `Authorized redirect URI` na:
   - `http://localhost:3000/auth/google/callback`
3. Zkopíruj Client ID + Secret do `.env`.

## Poznámky

- Videa se ukládají lokálně do `public/uploads/`.
- Metadata uživatelů a videí jsou v SQLite databázi `data/shortvid.db`.
