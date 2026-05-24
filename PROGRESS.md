# Renderfarm — Project Progress Notes

> Last updated: 2026-05-24

---

## What We Are Building

A **cloud render farm platform** — a Conductor-style service that lets 3D artists submit Blender scenes from inside Blender, have them rendered on remote machines, and download the finished frames. The system is designed to feel like professional render farm software (Conductor, SheepIt, Fox Renderfarm) but self-hosted on Vercel + Neon infrastructure.

The platform has **four components** that work together:

```
[Blender Addon]  →  [Next.js API on Vercel + Neon DB]  →  [Render Worker (Python)]
                              ↓
                     [Electron Desktop App]  ←  downloads finished frames
```

---

## The Four Components

### 1. Blender Addon (`renderfarm-companion/blender-addon/renderfarm_submitter.py`)
A Blender Python addon installed inside Blender. Artists use it to:
- Sign in to Renderfarm (browser-based OAuth callback on port 8989)
- Configure job settings: title, frame range, software version, chunk size, output folder
- Submit the job using a professional Conductor-style 4-phase flow

**Submission flow (v7 — current):**
1. **PREFLIGHT** — Scans all scene dependencies (images, linked libraries, fonts, sounds, Alembic caches, the .blend itself), shows them with type icons and file sizes, highlights missing ones in red
2. **SUBMITTING** — 4-step progress UI:
   - Step 1: Analyze dependencies
   - Step 2: SHA-256 hash all files + preflight API check for already-uploaded assets
   - Step 3: POST job record to API (status = "uploading")
   - Step 4: Upload only the *missing* assets to Vercel Blob with real chunked progress
3. **COMPLETE** — Shows job number (RF-XXXX) + "Open Dashboard" button → opens `/jobs/RF-XXXX` directly
4. **ERROR** — Shows error details + step that failed + Retry button

**Asset deduplication:** SHA-256 hash → check DB via `/api/jobs/preflight` → only upload files the server doesn't have yet. Same texture across 100 jobs = uploaded once.

**Current version:** v7 (`renderfarm_submitter_v7.zip`)  
**Location:** `renderfarm-companion/blender-addon/renderfarm_submitter.py`  
**Install:** Edit → Preferences → Add-ons → Install → select `renderfarm_submitter_v7.zip` → Enable  
**Token file:** saves JWT to `.rf_token` in the addon folder so the render worker can reuse it

---

### 2. Web Dashboard (`renderfarm.swade-art.com/` → deployed at `renderfarm-web.vercel.app`)
A **Next.js App Router** web app that serves as both the dashboard UI and the REST API backend.

**Frontend pages:**
| Route | Description |
|---|---|
| `/` | Jobs list — all submitted jobs, status, filter/search |
| `/jobs/RF-XXXX` | Job detail — status, frame progress bar, output frame links (polls every 5s) |
| `/login` | Sign in with email + password |
| `/usage` | Usage stats (placeholder) |
| `/calculator` | Cost calculator (placeholder) |
| `/admin` | Admin panel (placeholder) |
| `/profile` | Profile page (placeholder) |

**API routes:**
| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/login` | POST | Returns JWT `access_token` |
| `/api/jobs` | GET | List all jobs (or single with `?jobNumber=RF-XXXX`) |
| `/api/jobs` | POST | Create a new job (called by Blender addon) |
| `/api/jobs?id=` | PATCH | Update job status + outputs (called by render worker) |
| `/api/jobs/preflight` | POST | Check which SHA-256 hashes are already in the DB |
| `/api/assets?action=token` | POST | Generate Vercel Blob client token for a specific asset |
| `/api/assets?action=confirm` | POST | Record a successfully uploaded asset in the DB |
| `/api/upload` | PUT | Server-side frame upload (used by render worker for output frames) |

**Stack:**
- Next.js App Router (TypeScript)
- Tailwind CSS + custom CSS (Conductor dark theme)
- Vercel Blob (asset storage + rendered frame storage) — **Public** blob store required
- Neon Postgres via `@neondatabase/serverless` (jobs survive cold starts)
- JWT auth (`jsonwebtoken` + `bcryptjs`)

**Database tables:**
- `users` — id, email, password_hash, is_admin, created_at
- `jobs` — id, job_number, title, status, frames, software, blender_file, outputs (JSONB), manifest (JSONB), assets_total, assets_uploaded, created_at, updated_at
- `assets` — sha256 (PK), blob_url, filename, size_bytes, created_at

**Deployment:** GitHub (`Silasshaibu/renderfarm-web`) → auto-deploy on push to `master` → `renderfarm-web.vercel.app`

---

### 3. Electron Desktop App (`renderfarm-companion/` → `Renderfarm.exe`)
A desktop app artists use to monitor jobs and download finished frames without opening a browser.

**Built with:** Electron + Vite + React + TypeScript (`electron-vite`)

**Pages:**
| Page | Description |
|---|---|
| Sign In | Login with email/password, connects to live Vercel API |
| Plugins | Blender addon download links (placeholder) |
| Downloader | Lists all jobs from the API, shows status, download button for finished frames |
| Help | Documentation links |

**Key details:**
- API calls go through Electron main process via IPC (`ipcMain.handle` / `ipcRenderer.invoke`)
- API base URL: `https://renderfarm-web.vercel.app/api`
- Polls jobs every 10 seconds in the Downloader tab
- Frame download: opens folder picker → downloads each output URL → saves to `<folder>/<jobNumber>/frame_XXXX.png` → IPC progress events per frame
- Built with `npm run build` → output to `out/`
- **Launch:** `npm run launch` (uses `launch.cjs` which clears `ELECTRON_RUN_AS_NODE` env var) — must be run from user's own PowerShell, not Claude Code terminal

---

### 4. Python Render Worker (`renderfarm-companion/worker/renderfarm_worker.py`)
A Python script that runs on a local machine (or eventually a cloud VM) and processes render jobs.

**How it works:**
1. Reads auth token from `.rf_token` file (written by the Blender addon)
2. Polls `GET /api/jobs` every 15 seconds for jobs with `status == "queued"` (skips "uploading")
3. For each queued job:
   - Downloads the scene zip from Vercel Blob
   - Unzips it and finds the `.blend` file
   - Runs Blender headless: `blender --background scene.blend --render-anim --frame-start N --frame-end N`
   - Uploads each rendered frame via `PUT /api/upload`
   - PATCHes the job status to `done` with frame URLs
4. Marks job `failed` on any error

**Note:** The render worker was written to work with v5/v6 submission (where a zip of the .blend was uploaded). With v7's per-asset upload system, the worker needs updating to reconstruct the scene from the manifest before rendering. This is the next major task.

---

## Current Data Flow (End to End — v7)

```
1. Artist saves .blend file in Blender
2. Artist clicks Submit in the Renderfarm panel (Properties > Render)
3. Dialog opens showing PREFLIGHT state:
   - Lists all scene dependencies with icons (blend, image, library, font, sound, cache)
   - Shows file sizes, highlights missing files in red
   - "Continue Submission" button (or "Continue Anyway" if there are missing files)
4. Artist clicks "Continue Submission"
5. Dialog switches to SUBMITTING state — background thread starts:
   Step 1: Confirms dep list is ready (from PREFLIGHT scan)
   Step 2: SHA-256 hashes all existing files → calls POST /api/jobs/preflight
           → server returns which SHA-256s it doesn't have yet
   Step 3: POST /api/jobs with status="uploading", manifest (asset list), assets_total
           → API creates job in Neon DB, returns jobNumber + id
   Step 4: For each asset the server needs:
           → POST /api/assets?action=token → gets Vercel Blob client token
           → streams PUT to blob.vercel-storage.com in 64KB chunks (real progress shown)
           → POST /api/assets?action=confirm → records asset in assets table
           After all uploads: PATCH /api/jobs?id= with status="queued", assets_uploaded count
6. Dialog switches to COMPLETE state:
   - Shows job number (RF-XXXX)
   - "Open Dashboard" button → browser opens https://renderfarm-web.vercel.app/jobs/RF-XXXX
7. Dashboard shows job status = "queued", polls every 5s

--- Meanwhile on the render machine (NEEDS UPDATING for v7) ---

8.  python renderfarm_worker.py
9.  Worker polls /api/jobs every 15s, finds queued job
10. ⚠️ Worker still expects a zip blob URL — needs updating to use manifest assets
11. (Future) Worker reads job.manifest.assets[] → downloads each asset → reconstructs dir tree
12. Runs: blender --background scene.blend --render-anim
13. Uploads rendered frames via PUT /api/upload
14. PATCH /api/jobs?id= with status="done" + frame URLs
15. Dashboard job page shows output frame links
16. Artist downloads frames from dashboard or Electron app
```

---

## Credentials & Config

| Item | Value |
|---|---|
| Dashboard URL | https://renderfarm-web.vercel.app |
| GitHub repo | https://github.com/Silasshaibu/renderfarm-web |
| Vercel project | renderfarm-web (silas-projects2) |
| Vercel Blob store | Must be **Public** access (not Private) |
| Neon DB | Set `DATABASE_URL` in Vercel env vars |
| Login email | silasshaibu2@gmail.com |
| Login password | password123 |
| JWT secret | `renderfarm-dev-secret-change-in-production` (dev only) |
| Blender addon zip | `renderfarm-companion/blender-addon/renderfarm_submitter_v7.zip` |

---

## Where We Are Right Now ✅

- [x] Blender addon v7 installs and loads in Blender 3.1+
- [x] Sign in via browser OAuth callback works
- [x] PREFLIGHT dialog: scans all scene deps, shows with icons/sizes, flags missing files
- [x] SUBMITTING dialog: 4-step progress UI with real per-file progress bars
- [x] Asset SHA-256 deduplication: hashes all files, preflight API check, only uploads new ones
- [x] Jobs created immediately as "uploading" → render worker ignores until "queued"
- [x] Per-asset Vercel Blob upload: client token per file, real chunked streaming progress
- [x] COMPLETE dialog: shows job number + "Open Dashboard" → `/jobs/RF-XXXX`
- [x] ERROR dialog: shows error details + step that failed + Retry button
- [x] Neon Postgres migration: jobs survive Vercel cold starts
- [x] `assets` table: SHA-256 dedup storage
- [x] `jobs` table: manifest (JSONB), assets_total, assets_uploaded columns
- [x] `/api/jobs/preflight` endpoint: returns missing SHA-256s
- [x] `/api/assets?action=token` endpoint: dedup check + Vercel Blob client token
- [x] `/api/assets?action=confirm` endpoint: records uploaded asset in DB
- [x] Web dashboard loads jobs from Neon DB (survives cold starts)
- [x] Job detail page: status dot, frame progress bar, output frame links, live polling
- [x] Electron app: connects to live API, Downloader shows real jobs, frames download to local folder
- [x] Python render worker: filters by status="queued" only (ignores "uploading")

---

## Outstanding / Next Steps ⚠️

### 1. 🔴 Render Worker Needs Updating for v7 (CRITICAL)
**Problem:** The worker was written for v5/v6 submission flow where a single zip blob URL was stored in `blenderFile`. The v7 system uploads assets individually and stores a manifest. The worker needs to:
1. Read `job.manifest.assets[]` from the API response
2. Download each asset to its `path` relative to a temp working dir
3. The main `.blend` file is `type == "blend"` in the manifest
4. Run Blender on the downloaded `.blend` file

**Fix needed:** Update `renderfarm_worker.py` to use the manifest-based approach.

### 2. 🟡 Test Full End-to-End Pipeline
After fixing the render worker, test the complete flow:
1. Install `renderfarm_submitter_v7.zip` in Blender
2. Open a .blend with some textures
3. Submit → verify PREFLIGHT shows deps → Continue → verify all 4 steps complete
4. Check the job appears on the dashboard as "queued"
5. Run the render worker and verify it picks up the job, renders, and marks it done
6. Download frames from the Electron app

### 3. 🟡 No User Registration / Multi-User Support
`/api/auth/register` endpoint doesn't exist. New users can only be added by seeding the DB.

### 4. 🟡 Large File Timeout Risk
Very large scenes (500MB+) may hit timeouts during the asset upload phase. Consider:
- Increasing the token timeout in `/api/assets?action=token`
- Splitting uploads into parallel batches

---

## File Map

```
renderfarm.swade-art.com/          ← Next.js web app (this repo, on Vercel)
  app/
    page.tsx                       ← Jobs list page
    jobs/[id]/page.tsx             ← Job detail page (status + frames)
    api/
      auth/login/route.ts          ← JWT login (reads from Neon users table)
      jobs/route.ts                ← CRUD for jobs (Neon Postgres)
      jobs/preflight/route.ts      ← SHA-256 dedup check
      assets/route.ts              ← Vercel Blob client token + confirm
      upload/route.ts              ← Server-side frame upload (render worker)
  lib/
    db.ts                          ← Neon SQL client + initDB() (creates tables)
    api.ts                         ← API client for frontend (BASE = /api)

renderfarm-companion/              ← Local tools (NOT on Vercel)
  blender-addon/
    renderfarm_submitter.py        ← Blender addon source (v7)
    renderfarm_submitter_v7.zip    ← Latest installable addon (INSTALL THIS)
  worker/
    renderfarm_worker.py           ← Python render worker (needs v7 update)
    test_upload.py                 ← End-to-end upload test script
  src/                             ← Electron app source
    main/index.ts                  ← Electron main process + IPC handlers
    renderer/src/
      App.tsx                      ← Root component
      pages/Downloader.tsx         ← Job list + download UI
  out/                             ← Compiled Electron app (run this)
  launch.cjs                       ← Launch script (clears ELECTRON_RUN_AS_NODE)
```
