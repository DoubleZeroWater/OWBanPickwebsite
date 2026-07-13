# AGENTS.md

## Repository overview

`OWBanPickwebsite` is a single-page Overwatch map/Ban Pick application:

- Flask provides room, snapshot, global-admin, map and settings APIs.
- TypeScript and Vite build the browser UI from `frontend/src` into the ignored `dist/` directory.
- Playwright covers browser room flows; Python `unittest` covers room persistence and history behavior.
- Docker builds the frontend and runs Flask through a single Gunicorn worker on port 5174.

## Development commands

Install dependencies:

```bash
python -m pip install -r requirements.txt
npm install
```

Run Flask and the Vite development server in separate terminals:

```bash
python backend/app.py
npm run dev
```

Build and test:

```bash
npm run test:backend
npm run build
npm run test:e2e
```

Playwright defaults to `http://127.0.0.1:5175`; start `docker compose up -d --build` first or set `BASE_URL` to another running instance.

## Runtime data

- `backend/data/runtime/rooms.json` is the active-room index.
- Permanent per-room JSON files live under `backend/data/runtime/room_history/`.
- The entire runtime directory is ignored by Git and mounted by Docker Compose. Never delete or overwrite user runtime data during ordinary development.
- Backend tests set `OW_RUNTIME_DIR` to a temporary directory and must remain isolated from the default runtime path.
- The file-backed room store and process lock assume the current single-worker deployment. Do not increase Gunicorn workers without adding cross-process storage coordination.
