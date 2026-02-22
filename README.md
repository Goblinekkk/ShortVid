# ShortVid (GitHub Pages ready)

Hotový statický web na short videa, který nasadíš přímo na **GitHub Pages** a otevřeš v Chromu bez serveru.

## Co umí

- Přihlášení přes Google účet (Google Identity Services, čistě client-side).
- Automatické vytvoření lokálního kanálu po přihlášení.
- Úprava názvu kanálu.
- Nahrávání short videí z počítače.
- Feed videí.

## Jak deploynout na GitHub Pages

1. Pushni repozitář na GitHub.
2. V repu otevři **Settings → Pages**.
3. V části **Build and deployment** vyber:
   - Source: **Deploy from a branch**
   - Branch: **main** (root)
4. Počkej na deploy, URL bude např. `https://<username>.github.io/ShortVid/`.

## Google login nastavení

1. V Google Cloud Console vytvoř OAuth Client ID (typ **Web application**).
2. Do **Authorized JavaScript origins** přidej:
   - `https://<username>.github.io`
   - případně `http://localhost:8000` pro lokální test
3. Otevři `config.js` a vlož svůj Client ID do `googleClientId`.
4. Commit + push.

## Lokální spuštění (bez Node backendu)

Použij libovolný statický server, třeba:

```bash
python3 -m http.server 8000
```

Pak otevři `http://localhost:8000`.

## Důležité omezení statické verze

- Videa i data kanálu se ukládají jen v prohlížeči uživatele (LocalStorage + IndexedDB).
- Data se nesdílí mezi zařízeními.
- Na produkční sdílení videí mezi uživateli bude potřeba backend + cloud storage.
