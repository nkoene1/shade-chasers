# Supabase scoreboard — setup walkthrough

This app talks to your Supabase project in two different ways:

| Piece | What it uses | Why |
|--------|----------------|-----|
| **Vite app** (browser) | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | `fetch` to the Edge Function URL. The anon key is a public JWT. |
| **Edge Function** (server) | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase when deployed) | Inserts/reads `public.shade_chasers_users` and `public.shade_chasers_scores`. Never put the service role key in the Vite app. |

The function name is **`scoreboard`**, so the HTTP endpoint is:

`https://<project-ref>.supabase.co/functions/v1/scoreboard`

---

## Prerequisites

- A [Supabase](https://supabase.com) project (free tier is enough).
- **Edge Function deploy** — use the [Dashboard editor](#option-a--dashboard-no-cli) (no CLI) or the [Supabase CLI](#option-b--supabase-cli-from-this-repo). The `scoreboard` function must exist in **your** project.

---

## Step 1 — Get API URL and keys from the dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. Go to **Project Settings** (gear) → **API**.
3. Copy and keep in a safe place (you will use them in Step 4):
   - **Project URL** — looks like `https://abcdefghijk.supabase.co` (no trailing slash needed; the app strips one if present).
   - **Project API keys** → **`anon` `public`** — long JWT string. This is what you use as `VITE_SUPABASE_ANON_KEY`.
4. You do **not** need to copy the **service role** key into the game repo. The Edge Function will use the service role automatically in Supabase’s hosted environment after you deploy (Step 3).

> **Security:** The anon key is expected to be in the frontend. Never add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` for Vite or commit it to git.

---

## Step 2 — Create the scoreboard tables (run the migrations)

The tables are defined in the repo migrations:

- [`supabase/migrations/20260425140000_create_scores.sql`](../supabase/migrations/20260425140000_create_scores.sql)
- [`supabase/migrations/20260425170000_create_users_and_link_scores.sql`](../supabase/migrations/20260425170000_create_users_and_link_scores.sql)
- [`supabase/migrations/20260425172500_keep_best_score_per_user.sql`](../supabase/migrations/20260425172500_keep_best_score_per_user.sql)

**Option A — SQL Editor (no CLI)**

1. In the dashboard, open **SQL Editor**.
2. Open that migration file locally, copy its full contents, paste into a new query, and **Run**.

**Option B — Supabase CLI (from this repo root)**

1. [Install the CLI](https://supabase.com/docs/guides/cli/getting-started) and log in: `supabase login`.
2. Link the project: `supabase link --project-ref <your-project-ref>` (ref is the subdomain of your URL, e.g. `abcdefghijk` for `https://abcdefghijk.supabase.co`).
3. Push migrations: `supabase db push`  
   (or run the SQL file manually if you prefer.)

After this, you should see **`public.shade_chasers_users`** and **`public.shade_chasers_scores`** in **Table Editor** with RLS enabled and no direct `anon` policies — that is intentional: the browser does not query the tables directly; only the Edge Function (using the service role) does.

---

## Step 3 — Deploy the `scoreboard` Edge Function

Source file in the repo: [`supabase/functions/scoreboard/index.ts`](../supabase/functions/scoreboard/index.ts).

Supabase injects these at runtime for every deployed function — you must **not** paste your service role key into the editor:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

### Option A — Dashboard (no CLI)

You can create and deploy Edge Functions entirely in the browser. Official guide: [Getting Started with Edge Functions (Dashboard)](https://supabase.com/docs/guides/functions/quickstart-dashboard).

1. In the [Supabase Dashboard](https://supabase.com/dashboard), open your project.
2. In the left sidebar, open **Edge Functions**.
3. Click **Deploy a new function** → **Via Editor** (or equivalent: create function in the dashboard editor).
4. When asked for a name, use exactly **`scoreboard`**, so the URL matches what the game calls:  
   `https://<project-ref>.supabase.co/functions/v1/scoreboard`
5. Replace the template code with the full contents of [`supabase/functions/scoreboard/index.ts`](../supabase/functions/scoreboard/index.ts) from this repository (copy–paste from your editor).
6. Click **Deploy function** and wait until deployment finishes (often ~10–30 seconds).

**After deploy**

- The dashboard **Test** tab can send `GET` / `POST` with `Authorization: Bearer <anon key>` to verify the function.
- You can **download** the deployed code from the function page (useful to compare with the repo). Supabase notes that the dashboard editor has **no built-in version control**; for production, keeping the canonical source in git and using CI or the CLI is often preferable.

**Alternatives in the same UI**

- **Via AI Assistant**: describe the same behavior and deploy — you still need to match the `scoreboard` name and the HTTP contract (`GET` → `{ scores }`, `POST` actions for `create_user` and `submit_score`).

---

### Option B — Supabase CLI (from this repo)

1. [Install the CLI](https://supabase.com/docs/guides/cli/getting-started), run `supabase login`, then link:  
   `supabase link --project-ref <your-project-ref>`
2. From the **repository root**:

   ```bash
   supabase functions deploy scoreboard
   ```

3. The CLI uploads the local [`supabase/functions/scoreboard`](../supabase/functions/scoreboard) folder. Same runtime secrets as Option A.

---

### Verify (either option)

1. **JWT verification (default on):** The app sends `Authorization: Bearer <anon key>` and `apikey: <anon key>`. The anon key is a valid project JWT, so `GET`/`POST` should work. If you disabled **Verify JWT** for this function, calls can still work; keep consistent with your project settings.

2. **Quick check** (replace `<project-ref>` and keys):

   ```text
   GET https://<project-ref>.supabase.co/functions/v1/scoreboard
   Headers:
     Authorization: Bearer <anon key>
     apikey: <anon key>
   ```

   Expect HTTP **200** and a body like `{"scores":[]}` or a list of rows. **401** usually means wrong project URL, wrong key, or the function is not named `scoreboard`.

---

## Step 4 — Configure the Vite app (local dev)

1. In the project root, copy the example file:

   ```text
   .env.example  →  .env.local
   ```

2. Edit **`.env.local`** (this file is git-ignored via `*.local`):

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...your_anon_key...
   ```

3. **Restart** the dev server after any env change — Vite only reads `import.meta.env` at startup:

   ```bash
   pnpm dev
   ```

4. In the start screen, **Top 10** and starting a run should work if Step 2 and Step 3 succeeded. If env vars are missing, the UI explains that the scoreboard is not configured and blocks user creation.

---

## HTTP contract

`GET /functions/v1/scoreboard` returns the fastest ten scores:

```json
{
  "scores": [
    {
      "id": "score-uuid",
      "user_id": "user-uuid",
      "player_name": "Runner",
      "finish_time_ms": 82742,
      "created_at": "2026-04-25T15:00:00.000Z"
    }
  ]
}
```

`POST /functions/v1/scoreboard` creates or reclaims a display-name user before the run starts:

```json
{
  "action": "create_user",
  "name": "Runner",
  "user_id": "optional-existing-user-uuid"
}
```

The browser stores the returned `user.id` in localStorage and sends it on later starts. If the id already belongs to the same user, the function reuses that row instead of trying to insert a duplicate. If the stored user changes their display name, the same row is updated as long as the new name is not taken. Duplicate names owned by another user return HTTP `409`.

`POST /functions/v1/scoreboard` saves a finished run by user id:

```json
{
  "action": "submit_score",
  "user_id": "user-uuid",
  "finish_time_ms": 82742
}
```

Each user keeps only one score row. If the submitted `finish_time_ms` is faster than the user's existing row, the existing row's `finish_time_ms` and `created_at` are replaced with the new run. Slower submissions leave the current row unchanged.

---

## Step 5 — Production build (optional)

For `pnpm build` / hosting:

- Set the same two variables in your host’s environment (Vercel, Netlify, etc.) with the `VITE_` prefix. They are baked into the static build at build time, not at runtime, unless you use a custom pipeline.

---

## Checklist (quick)

- [ ] Migrations applied; `public.shade_chasers_users` and `public.shade_chasers_scores` exist.
- [ ] `supabase functions deploy scoreboard` completed (or function deployed by other means with same name).
- [ ] `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Settings → API**.
- [ ] Dev server restarted.
- [ ] `GET` to `/functions/v1/scoreboard` with anon `Authorization` + `apikey` returns 200.

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| “Scoreboard not configured” in the app | `VITE_*` missing or wrong filename (must be `.env.local` at project root for Vite), or dev server not restarted. |
| 401 on the function | Anon key matches this project; URL project ref is correct; function is named `scoreboard`. |
| 409 on Start | The display name is already taken by another stored user id; choose a different unique name. |
| 500 on POST/GET from the function | Migrations ran; service role is available in Supabase runtime (redeploy function); check **Functions → scoreboard** logs in the dashboard. |
| CORS errors in the browser | Edge Function includes CORS headers; if you use a very old CLI template, compare with the repo’s `index.ts`. |
| Scores not appearing | Confirm insert works (check Table Editor or logs); `GET` orders by `finish_time_ms` ascending, then `created_at`, limit 10. |

---

## What “correct” does not require

- Installing `@supabase/supabase-js` in the Vite app (this project uses `fetch` only).
- Exposing the service role to the client.
- Enabling RLS policies for `anon` on the scoreboard tables — the app does not use PostgREST on those tables; the Edge Function uses the service role.

---

## Notes

- The leaderboard is not designed as a strong anti-cheat layer; it reduces casual abuse by keeping direct DB access off the client. Stronger rules can be added later (rate limits, auth, etc.) if needed.
