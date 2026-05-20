# RE Hub — Cloud Deployment Guide
## Go from local app → accessible on any device, anywhere

---

## STEP 1 — Create a free Supabase account (your cloud database)

1. Go to **https://supabase.com** → click "Start for Free"
2. Sign up with your email (or Google)
3. Click **"New project"**
   - Name: `re-hub`
   - Database password: make a strong one — save it somewhere
   - Region: **US East (North Virginia)**  ← closest to Michigan
   - Plan: **Free** ✓
4. Wait ~2 minutes for it to spin up
5. Once ready, go to **Settings → API** (left sidebar)
6. Copy these two values — you'll need them in Step 2:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon / public key** (long string starting with `eyJ...`)

---

## STEP 2 — Run the database schema

1. In Supabase, click **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the file `supabase-setup.sql` from your project folder
4. Copy its entire contents and paste into the SQL editor
5. Click the green **"Run"** button
6. You should see "Success. No rows returned"

---

## STEP 3 — Add your Supabase keys to the project

1. Open `C:\Users\monica\my-re-hub\.env.local` in Notepad
2. Replace the placeholder values:
   ```
   REACT_APP_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=eyJ...your-anon-key...
   ```
   with the actual values you copied in Step 1

---

## STEP 4 — Push your code to GitHub

1. Go to **https://github.com** → sign up (free) or sign in
2. Click **"+"** → **"New repository"**
   - Name: `re-hub`
   - Private ✓ (keep your code private)
   - Click "Create repository"
3. Open **Command Prompt** (not PowerShell) and run:
   ```
   cd C:\Users\monica\my-re-hub
   git init
   git add -A
   git commit -m "Initial RE Hub cloud build"
   git remote add origin https://github.com/YOUR-USERNAME/re-hub.git
   git push -u origin main
   ```
   (Replace YOUR-USERNAME with your GitHub username)

---

## STEP 5 — Deploy to Vercel (your web address)

1. Go to **https://vercel.com** → sign up with GitHub
2. Click **"Add New → Project"**
3. Import your `re-hub` repo from GitHub
4. Vercel will auto-detect it as a React app
5. **Before clicking Deploy**, click **"Environment Variables"** and add:
   | Name | Value |
   |------|-------|
   | `REACT_APP_SUPABASE_URL` | (your Supabase URL from Step 1) |
   | `REACT_APP_SUPABASE_ANON_KEY` | (your anon key from Step 1) |
   | `FUB_API_KEY` | (your FUB API key) |
   | `ANTHROPIC_API_KEY` | (your Anthropic key from console.anthropic.com — required for ALL AI features) |
6. Click **"Deploy"**
7. Wait ~2 minutes
8. Vercel gives you a URL like: `re-hub-monica.vercel.app`

**That's your app URL! Open it on any phone, laptop, or computer.**

---

## STEP 6 — Set up lead capture webhooks (Railway)

This keeps your lead auto-capture working from Homes.com, Zillow, etc.

1. Go to **https://railway.app** → sign up with GitHub
2. Click **"New Project → Deploy from GitHub repo"** → select `re-hub`
3. Click **"Add Variables"** and add:
   - `PORT` = `3001`
4. Railway will detect `server.js` and deploy it
5. Click **"Settings → Networking → Generate Domain"**
6. Your webhook URL will be something like: `re-hub-production.up.railway.app`
7. Update your Zapier/Make/email forwarding to use this new URL instead of `localhost:3001`

**Monthly cost: ~$5/month** (Railway Hobby plan)

---

## After deployment

- **Your web app**: `https://re-hub-YOURNAME.vercel.app`
- Open on iPhone: visit the URL in Safari → Share → "Add to Home Screen"
- Open on Android: visit in Chrome → menu → "Add to Home Screen"
- Open on laptop: just bookmark the URL
- **All devices stay in sync** — add a lead on your phone, see it on your laptop instantly

---

## Updating the app later

Whenever you want to push changes:
```
cd C:\Users\monica\my-re-hub
git add -A
git commit -m "update"
git push
```
Vercel auto-deploys within 2 minutes. ✓
