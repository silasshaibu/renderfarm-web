# Renderfarm — Project Progress Notes

> Last updated: 2026-05-24

---

## What We Are Building

A **cloud render farm platform** — a Conductor-style service that lets 3D artists submit Blender scenes from inside Blender, have them rendered on remote machines, and download the finished frames. The system is designed to feel like professional render farm software (Conductor, SheepIt, Fox Renderfarm) but self-hosted on Vercel + Railway infrastructure.

The platform has **four components** that work together:

```
[Blender Addon]  →  [Next.js API on Vercel]  →  [Render Worker (Python)]
                            ↓
                    [Electron Desktop App]  ←  downloads finished frames
```

---

## The Four Components

### 1. Blender Addon (`renderfarm-companion/blender-addon/renderfarm_submitter.py`)
A Blender Python addon installed inside Blender. Artists use it to:
- Sign in to Renderfarm (browser-based OAuth callback on port 8989)
- Configure job settings: title, frame range, software version, chunk size, output folder
- Validate the scene before submitting
- Submit the job: zips the `.blend` file → uploads to Vercel Blob → creates a job record via the API
- Shows a Conductor-style submission dialog with three tabs:
  - **Validation tab** — checks scene is saved, token exists, no errors
  - **Progress tab** — live progress bars for MD5, zip, file upload (real chunked streaming progress)
  - **Response tab** — job number, "Go to dashboard" button (opens `/jobs/RF-XXXX` directly)

**Current version:** v6 (`renderfarm_submitter_v6.zip`)  
**Location:** `renderfarm-companion/blender-addon/renderfarm_submitter.py`  
**Token file:** saves JWT to `.rf_token` in the addon folder so the render worker can reuse it

---

### 2. Web Dashboard (`renderfarm.swade-art.com/` → deployed at `renderfarm-web.vercel.app`)
A **Next.js 14 App Router** web app that serves as both the dashboard UI and the REST API backend.

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
| `/api/upload-url` | POST | Generate Vercel Blob client token for direct upload |
| `/api/upload` | PUT | Server-side frame upload (used by render worker) |
| `/api/upload-complete` | POST | Blob upload webhook callback |

**Stack:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + custom CSS (Conductor dark theme)
- Vercel Blob (scene zip storage + rendered frame storage)
- JWT auth (`jsonwebtoken` + `bcryptjs`)
- **In-memory job store** — jobs reset on every Vercel cold start (see "Where We're Stuck")

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
- Built with `npm run build` → output to `out/`
- Launch: `npm run launch` (uses `launch.cjs` which clears `ELECTRON_RUN_AS_NODE` env var)
- **Known issue:** Must be launched from user's own PowerShell, not from Claude Code terminal (ELECTRON_RUN_AS_NODE conflicts)

---

### 4. Python Render Worker (`renderfarm-companion/worker/renderfarm_worker.py`)
A Python script that runs on a local machine (or eventually a cloud VM) and processes render jobs.

**How it works:**
1. Reads auth token from `.rf_token` file (written by the Blender addon)
2. Polls `GET /api/jobs` every 15 seconds for queued jobs that have a `blenderFile` URL
3. For each queued job:
   - Downloads the scene zip from Vercel Blob
   - Unzips it and finds the `.blend` file
   - Runs Blender headless: `blender --background scene.blend --render-anim --frame-start N --frame-end N`
   - Uploads each rendered frame via `PUT /api/upload`
   - PATCHes the job status to `done` with frame URLs
4. Marks job `failed` on any error

**Blender auto-detection:** searches common Windows install paths (3.1 through 4.2)  
**Auth:** reads from `.rf_token` or `RF_TOKEN` env var  
**Override Blender path:** set `BLENDER_PATH` env var

---

## Current Data Flow (End to End)

```
1. Artist saves .blend file in Blender
2. Artist clicks Submit in the Renderfarm N-panel
3. Addon validates scene (saved, token exists, no errors)
4. Artist clicks "Continue Submission"
5. Background thread:
   a. Computes MD5 hash of .blend
   b. Zips the .blend file into a temp zip
   c. Calls POST /api/upload-url → gets Vercel Blob client token + PUT URL
   d. Streams zip via PUT to blob.vercel-storage.com (real progress shown)
   e. Calls POST /api/jobs with title, frames, software, blender_file (blob URL)
   f. API creates job with status="queued", returns jobNumber
6. Dialog switches to Response tab → shows job number
7. Artist clicks "Go to dashboard" → browser opens /jobs/RF-XXXX
8. Dashboard shows job status, polls every 5s

--- Meanwhile on the render machine ---

9.  python renderfarm_worker.py
10. Worker polls /api/jobs every 15s, finds queued job
11. Downloads scene zip from Vercel Blob
12. Unzips, finds .blend file
13. Runs: blender --background scene.blend --render-anim
14. Uploads rendered frames via PUT /api/upload
15. PATCH /api/jobs?id= with status="done" + frame URLs
16. Dashboard job page shows output frame links
17. Artist downloads frames from dashboard or Electron app
```

---

## Credentials & Config

| Item | Value |
|---|---|
| Dashboard URL | https://renderfarm-web.vercel.app |
| GitHub repo | https://github.com/Silasshaibu/renderfarm-web |
| Vercel project | renderfarm-web (silas-projects2) |
| Vercel Blob store | renderfarm-scenes (Public access) |
| Login email | silasshaibu2@gmail.com |
| Login password | password123 |
| JWT secret | `renderfarm-dev-secret-change-in-production` (dev only) |
| Blender addon zip | `renderfarm-companion/renderfarm_submitter_v6.zip` |

---

## Where We Are Right Now ✅

- [x] Blender addon installs and loads in Blender 3.1+
- [x] Sign in via browser OAuth callback works
- [x] Submission dialog: Validation → Progress → Response tabs (single persistent dialog)
- [x] Real chunked upload progress (streams 64KB chunks, progress bar moves live)
- [x] Scene zip uploads to Vercel Blob (Public store, client-token direct upload)
- [x] Job created in API with blob URL stored
- [x] "Go to dashboard" button opens the specific job page (`/jobs/RF-XXXX`)
- [x] Web dashboard loads jobs from real API (not localhost)
- [x] Job detail page: status dot, frame progress bar, output frame links, live polling
- [x] Electron app connects to live API (not localhost)
- [x] Electron Downloader shows real jobs from API, polls every 10s
- [x] Python render worker: downloads, renders, uploads frames, marks job done
- [x] Test upload pipeline verified end-to-end (`test_upload.py` passes all 4 steps)

---

## Where We Are Stuck / Known Issues ⚠️

### 1. 🔴 In-Memory Job Store (CRITICAL)
**Problem:** `app/api/jobs/route.ts` stores jobs in a JavaScript array in memory. Every time Vercel spins up a new serverless function instance (cold start), the jobs array resets to the two seed jobs. Jobs submitted by the addon disappear after a few minutes.

**Fix needed:** Migrate to a real database.  
**Recommended:** Neon (serverless Postgres) — already used in other projects in this repo.  
**Steps:**
1. Create a Neon project, get `DATABASE_URL`
2. Set `DATABASE_URL` in Vercel environment variables
3. Install `@neondatabase/serverless` or `drizzle-orm`
4. Replace the in-memory `jobs[]` array with Neon queries in each route handler

---

### 2. 🟡 Render Worker Not Tested End-to-End Yet
**Problem:** The Python worker script exists and the logic is correct, but we haven't run it against a real queued job with a real Blender install yet. The worker may hit issues with:
- Blender path not found (use `BLENDER_PATH` env var to override)
- `.blend` file dependencies (textures packed or external?)
- Frame output format not matching expected extensions

**To test:**
```powershell
cd renderfarm-companion\worker
python renderfarm_worker.py
```
Then submit a job from Blender and watch the worker pick it up.

---

### 3. 🟡 Download Frames in Electron App (Incomplete)
**Problem:** The Downloader page shows jobs and has a "Download outputs" button, but `handleDownload()` is a TODO — it shows a status message but doesn't actually download files to a local folder.

**Fix needed:** 
- Add a folder picker dialog (Electron `dialog.showOpenDialog`)
- Loop through `job.outputs[]` URLs and download each frame file to the selected folder
- Show download progress per frame

---

### 4. 🟡 No User Registration / Multi-User Support
**Problem:** The user store in `app/api/auth/login/route.ts` is hardcoded with one user (`silasshaibu2@gmail.com`). The registration page exists in the UI but `/api/auth/register` either doesn't exist or uses an in-memory store.

**Fix needed:** Database (Neon) with a `users` table. This is blocked by issue #1.

---

### 5. 🟡 Scene Upload Size Limit for Large Files
**Problem:** Large `.blend` files with many textures can be slow to upload (Vercel Blob is geographically variable). The client-token upload approach is correct and has no hard size limit, but very large files (500MB+) may time out.

**Mitigation:** The addon already streams in 64KB chunks with real progress. For very large files, consider zipping with texture compression or using `--pack-external-data` before submission.

---

### 6. 🟢 Minor: Blender 3.1 Icon Compatibility
**Status:** Fixed in v6.  
Some Blender icons used in the addon (e.g. `SMALL_TRI_RIGHT_VEC`) don't exist in Blender 3.1. Replaced with `RIGHTARROW`.

---

## Immediate Next Steps (Priority Order)

1. **Run the render worker** against a real submitted job to test the full pipeline
2. **Migrate job store to Neon** so jobs survive cold starts
3. **Implement frame download** in the Electron app
4. **Test Electron app** — rebuild with `npm run build`, launch with `npm run launch` from own PowerShell

---

## File Map

```
renderfarm.swade-art.com/          ← Next.js web app (this repo, on Vercel)
  app/
    page.tsx                       ← Jobs list page
    jobs/[id]/page.tsx             ← Job detail page (status + frames)
    api/
      auth/login/route.ts          ← JWT login
      jobs/route.ts                ← CRUD for jobs (in-memory)
      upload-url/route.ts          ← Vercel Blob client token generator
      upload/route.ts              ← Server-side frame upload (render worker)
  lib/api.ts                       ← API client (BASE = /api)

renderfarm-companion/              ← Local tools (NOT on Vercel)
  blender-addon/
    renderfarm_submitter.py        ← Blender addon source
  renderfarm_submitter_v6.zip      ← Latest installable addon
  worker/
    renderfarm_worker.py           ← Python render worker
    test_upload.py                 ← End-to-end upload test script
  src/                             ← Electron app source
    main/index.ts                  ← Electron main process + IPC handlers
    renderer/src/
      App.tsx                      ← Root component
      pages/Downloader.tsx         ← Job list + download UI
  out/                             ← Compiled Electron app (run this)
  launch.cjs                       ← Launch script (clears ELECTRON_RUN_AS_NODE)
```
