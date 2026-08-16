# DebtFree — Setup & Deployment Guide

This guide assumes **no coding experience**. Follow it top to bottom and you'll have DebtFree
running on your own computer and then live on the internet.

If you get stuck on any step, the error message you see is almost always the answer — copy it
into a search engine, or come back and paste it here.

---

## What you need before you start

- A computer (Mac or Windows)
- An email address
- About 30–45 minutes for the first-time setup

You do **not** need to know how to code. You will copy and paste a few commands into a program
called "Terminal" (Mac) or "Command Prompt" / "PowerShell" (Windows) — every command you need is
written out exactly below.

---

## Part 1 — Install the tools (one-time only)

### 1.1 Install Node.js

Node.js is the program that runs this app.

1. Go to **https://nodejs.org**
2. Download the **LTS** version (the button that says "Recommended for most users")
3. Open the downloaded file and click through the installer (default options are fine)
4. To check it worked: open Terminal (Mac: press `Cmd+Space`, type "Terminal", press Enter) or
   Command Prompt (Windows: press the Windows key, type "cmd", press Enter), then type:
   ```
   node --version
   ```
   and press Enter. You should see something like `v20.11.0`. If you see an error, restart your
   computer and try again.

### 1.2 Unzip the project

1. Find the `debtfree-mvp.zip` file you downloaded and unzip it (double-click it on Mac, or
   right-click → "Extract All" on Windows).
2. Move the resulting `debtfree` folder somewhere easy to find, like your Desktop.

---

## Part 2 — Create your Supabase account (the database)

Supabase is where all your app's data lives — user accounts, debts, payments. It's free to
start.

1. Go to **https://supabase.com** and click **Start your project**.
2. Sign up (GitHub sign-in is fastest, or use email).
3. Click **New Project**.
   - **Name**: anything, e.g. `debtfree`
   - **Database Password**: click "Generate a password" and **save it somewhere safe** (you
     likely won't need it again, but keep it just in case).
   - **Region**: pick the one closest to your users (e.g. Mumbai/Singapore for India).
   - Click **Create new project**. Wait 1–2 minutes while Supabase sets things up.

### 2.1 Run the database setup script

1. In your new Supabase project, look at the left sidebar and click the **SQL Editor** icon
   (it looks like `>_`).
2. Click **New query**.
3. Open the file `supabase/schema.sql` from the project folder you unzipped (open it with any
   text editor — Notepad, TextEdit, or double-click it and choose "Open with Text Editor").
4. Select **all** the text in that file (Ctrl+A / Cmd+A), copy it (Ctrl+C / Cmd+C).
5. Paste it into the Supabase SQL Editor (Ctrl+V / Cmd+V).
6. Click the green **Run** button (or press Ctrl+Enter / Cmd+Enter).
7. You should see "Success. No rows returned" at the bottom. That means your database — all the
   tables for users, debts, payments, and everything else — is now set up.

### 2.2 Turn on email sign-up

1. In the left sidebar, click **Authentication** → **Providers**.
2. Confirm **Email** is enabled (it usually is by default).
3. Click **Authentication** → **URL Configuration** in the sidebar.
4. For now, leave the default `http://localhost:3000` as the Site URL — you'll come back and
   update this in Part 4 once your app is live on the internet.

### 2.3 Get your API keys

You need three pieces of information from Supabase to connect your app to it.

1. Click the **Settings** (gear icon) in the left sidebar → **API**.
2. You'll see:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string under "Project API keys"
   - **service_role** key — another long string, marked "secret". Click "Reveal" to see it.
3. Keep this browser tab open — you'll copy these into your project in the next step.

> ⚠️ **The `service_role` key is powerful and secret.** It can read and change anyone's data.
> Never share it, never put it in a file you send to someone else, and never paste it anywhere
> in your app's actual code — it only ever goes into the environment variable file described
> below, which stays on your computer and (later) inside Vercel's private settings.

---

## Part 3 — Run the app on your own computer

### 3.1 Add your Supabase keys to the project

1. Inside the `debtfree` folder, find the file named `.env.local.example`.
2. Make a **copy** of it and rename the copy to exactly `.env.local` (note: it starts with a dot,
   and has no `.example` at the end).
   - Mac: right-click the file → Duplicate, then rename.
   - Windows: copy/paste the file, then rename. If Windows won't let you start a filename with a
     dot, first save it as `env.local.txt`, then use Command Prompt: `ren env.local.txt .env.local`
3. Open `.env.local` in a text editor and fill in the three values from Part 2.3:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
4. Save the file.

### 3.2 Install and run

1. Open Terminal / Command Prompt.
2. Navigate into the project folder. If you put it on your Desktop, type:
   ```
   cd Desktop/debtfree
   ```
   (Windows users may need `cd Desktop\debtfree` instead.)
3. Install the app's dependencies (this downloads everything the app needs — only needed once,
   or whenever you change dependencies):
   ```
   npm install
   ```
   This takes a minute or two. You'll see a lot of text scroll by — that's normal.
4. Start the app:
   ```
   npm run dev
   ```
5. Open your web browser and go to **http://localhost:3000**. You should see the DebtFree
   landing page.
6. To stop the app, go back to Terminal and press `Ctrl+C`.

### 3.3 Try it out

1. Click **Start My Debt Plan**, sign up with your email and a password.
2. Check your email for a confirmation link (check spam if you don't see it) and click it.
3. You should land on the onboarding flow, then the dashboard.
4. Add a debt, record a payment, and check that the numbers update — this confirms your
   Supabase connection is working end to end.

---

## Part 4 — Deploy to the internet (Vercel)

Vercel hosts the app so anyone can visit it, not just you on your own computer. It's free for
personal projects.

### 4.1 Put your project on GitHub

Vercel deploys from GitHub, so your code needs to live there first.

1. Go to **https://github.com** and sign up if you don't have an account.
2. Click the **+** icon (top right) → **New repository**.
3. Name it `debtfree`, leave it Public or Private (your choice), don't check any of the extra
   boxes, click **Create repository**.
4. On the next page, you'll see a section "…or push an existing repository from the command
   line." Back in Terminal (still inside the `debtfree` folder), run these one at a time:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/debtfree.git
   git push -u origin main
   ```
   Replace `YOUR-USERNAME` with your actual GitHub username. If `git` isn't recognized, download
   it from **https://git-scm.com** and try again.
   > Your `.env.local` file (with your secret keys) is automatically excluded from this upload —
   > it's listed in `.gitignore` specifically so your keys never end up on GitHub.

### 4.2 Import into Vercel

1. Go to **https://vercel.com** and sign up using your GitHub account (this makes the next step
   automatic).
2. Click **Add New…** → **Project**.
3. Find your `debtfree` repository in the list and click **Import**.
4. Vercel will detect it's a Next.js app automatically. Before clicking Deploy, expand
   **Environment Variables** and add the same three values from your `.env.local` file:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |

5. Click **Deploy**. Wait 1–2 minutes.
6. You'll get a live URL like `https://debtfree-yourname.vercel.app` — this is your app, live on
   the internet.

### 4.3 Tell Supabase about your live URL

This step is required for sign-up emails and password reset links to work correctly on the live
site.

1. Back in Supabase: **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Vercel URL, e.g. `https://debtfree-yourname.vercel.app`.
3. Under **Redirect URLs**, add:
   ```
   https://debtfree-yourname.vercel.app/auth/callback
   https://debtfree-yourname.vercel.app/auth/reset-password
   ```
4. Click **Save**.
5. Visit your live Vercel URL, sign up again with a real email, and confirm the whole flow works
   end to end on the live site.

### 4.4 (Optional) Make yourself an admin

The app has a hidden admin page at `/admin` that shows aggregate stats (total users, total debt
tracked, etc.) — never anyone's individual financial details. To access it:

1. Sign up / log in on your live app first, so your account exists.
2. In Supabase: **Table Editor** → `profiles` table, find your row (or use SQL Editor with the
   command below), and note your user ID — or just run this in the **SQL Editor**:
   ```sql
   update profiles set is_admin = true
   where id = (select id from auth.users where email = 'your-email@example.com');
   ```
3. Visit `https://your-app.vercel.app/admin` while logged in.

---

## Making changes later

Whenever you edit the code and want to update your live site:

```
git add .
git commit -m "describe what you changed"
git push
```

Vercel automatically redeploys within a minute or two of every push.

---

## Is my users' data actually private?

Yes — and not just because the app tries to hide it. Supabase enforces this at the database
level with something called **Row Level Security (RLS)**, which is set up in
`supabase/schema.sql`. In plain terms: even if someone found a bug in the app's code, the
database itself refuses to hand back any row that doesn't belong to the person asking. This is
stronger than "the app checks before showing you data" — the database checks too, every time.

One extra protection worth knowing about: the admin flag (`is_admin`) that controls access to
`/admin` cannot be changed by a user from inside the app, even by directly calling the database —
only from the Supabase SQL Editor, which only you (the project owner) have access to.

---

## Troubleshooting

**"npm: command not found"** — Node.js isn't installed correctly. Redo Part 1.1 and restart your
computer.

**The app loads but nothing saves / dashboard shows demo data even after signing up** — Double
check `.env.local` has your real Supabase URL and anon key, with no extra spaces, and that you
restarted `npm run dev` after editing it (env files are only read when the app starts).

**Confirmation email never arrives** — Check spam. If it's still missing, in Supabase go to
Authentication → Users and check if your account shows up as "unconfirmed" — you can manually
confirm it there for testing.

**"Not authorized" on `/admin`** — You haven't set `is_admin = true` for your account yet (see
Part 4.4), or you're not logged in.

**Vercel deploy fails** — Click into the failed deployment in Vercel and read the build log; the
error is usually a missing or misspelled environment variable. Double-check the three values
against your Supabase Settings → API page exactly.

---

## What's built vs. what's still a known gap

**Fully working:** landing page, sign up/login/password reset, onboarding, dashboard, add/edit
debts, record/edit/delete payments (with correct balance recalculation), repayment plan
(Avalanche/Snowball), debt-free simulator, monthly budget, progress page with charts, milestones,
settings (including working account deletion), admin aggregate stats.

**Not yet built:** an in-app notification inbox (the underlying data is recorded, just nothing
displays it as a list yet), email/push notification delivery, a scheduled job for due-date
reminders, SEO calculator landing pages, and paid subscription tiers. None of these block using
the app for its core purpose — tracking debts and following a payoff plan.

---

## Environment variables reference

| Variable | Where to find it | Used where |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | Everywhere (safe to be public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | Everywhere (safe to be public — real protection comes from Row Level Security, not from hiding this key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (click Reveal) | Server-only: powers `/api/admin/stats` and `/api/account/delete`. Never put this in `NEXT_PUBLIC_` anything. |
