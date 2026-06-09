# BeatVision — Vercel Deployment Guide

> **Tagline:** Every Song Has a World. BeatVision Reveals It.

---

## Quick Reference — Vercel Project Settings

| Setting | Value |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `.` (repository root) |
| **Install Command** | `pnpm install` |
| **Build Command** | `pnpm run build` |
| **Output Directory** | `dist` |

---

## Step-by-Step Deployment

### 1. Fork / push the repository to GitHub (or GitLab / Bitbucket)

```bash
git add .
git commit -m "ready for Vercel deployment"
git push
```

### 2. Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select your repo
3. Vercel will detect the framework as **Vite** automatically
4. Confirm the settings match the table above — change them if needed

### 3. Add Environment Variables

In Vercel → **Settings → Environment Variables**, add:

| Variable | Value / Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon/public key |
| `VITE_CREDIT_SAFE_MODE` | `true` — keeps all AI providers disabled until you're ready |
| `VITE_REAL_AI_PROVIDERS_ENABLED` | `false` — prevents real AI calls on first deploy |

> **`INTEGRATIONS_API_KEY`** and all other AI provider secrets belong in **Supabase Edge Function secrets**, not in Vercel environment variables and never in frontend code:
> ```bash
> supabase secrets set INTEGRATIONS_API_KEY=your-platform-key
> ```

### 4. Deploy

Click **Deploy**. Vercel will run:

```
pnpm install
pnpm run build   # → vite build → outputs to dist/
```

The `dist/` folder is served as the static site.

### 5. SPA Routing

BeatVision uses React Router with `BrowserRouter`. The `vercel.json` in the
repository root already configures the required catch-all rewrite:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This ensures deep links (`/project/abc`, `/dashboard`) load correctly.

---

## Local Development

```bash
# 1. Install dependencies (Node.js ≥ 20 required)
pnpm install

# 2. Copy env template and fill in your values
cp .env.example .env
# Edit .env — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start the dev server
pnpm run dev
# → http://localhost:5173 (also accessible on LAN)

# 4. Production build (same command Vercel runs)
pnpm run build
# → outputs to dist/

# 5. Preview the production build locally
pnpm run preview   # or: pnpm run start
# → http://localhost:4173
```

---

## Supabase Configuration

BeatVision uses Supabase for:
- **Auth** — user accounts and sessions
- **Database** — projects, scenes, images, video segments
- **Storage** — scene images, motion clips, render manifests, songs
- **Edge Functions** — AI provider calls (LLM, image gen, video gen)

### Apply database migrations

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Apply all migrations
supabase db push
```

### Deploy Edge Functions

```bash
# Deploy all functions at once
supabase functions deploy

# Or deploy each BeatVision function individually
supabase functions deploy beatvision-generate
supabase functions deploy large-language-model
supabase functions deploy kling-omni-video-submit
supabase functions deploy kling-omni-video-query
```

### Set Edge Function secrets

AI provider keys are stored as Edge Function secrets — **not** in `.env`:

```bash
supabase secrets set INTEGRATIONS_API_KEY=your-platform-key
# Add any other provider secrets your Edge Functions require
```

---

## Environment Variables Reference

### Vercel Environment Variables (browser-safe)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | — | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | — | Supabase anon/public key |
| `VITE_CREDIT_SAFE_MODE` | ✅ | `true` | Disable all AI providers until explicitly enabled |
| `VITE_REAL_AI_PROVIDERS_ENABLED` | ✅ | `false` | Prevent real AI calls on first deploy |

### Supabase Edge Function Secrets (server-side only — never in Vercel or `.env`)

| Secret | Description |
|---|---|
| `INTEGRATIONS_API_KEY` | Platform LLM gateway key — injected into Edge Functions only |

> ⚠️ **`INTEGRATIONS_API_KEY` must never be added as a Vercel env var or committed to Git.**  
> Set it exclusively via: `supabase secrets set INTEGRATIONS_API_KEY=your-key`

---

## Important Notes

- **`miaodaDevPlugin`** is a Miaoda platform dev tool — it is not included in
  `vite.config.ts` and is not needed for Vercel builds.
- **Node.js ≥ 20** and **pnpm** are required.
- **Do not commit `.env`** — it is listed in `.gitignore`.
- The build does **not** call any paid AI providers — all AI features run at
  runtime via Supabase Edge Functions, triggered by the user.
- If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing, the app
  will log a clear error in the browser console instead of crashing silently.

