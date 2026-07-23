# Task Tracker — setup guide

## 1. Firebase project

1. https://console.firebase.google.com → Add project → any name, e.g. `task-tracker` → keep Google Analytics off (not needed).
2. In the project: **Build → Firestore Database → Create database** → start in production mode → pick a region close to Bangladesh (e.g. `asia-south1`).
3. **Build → Hosting → Get started** (just click through, you'll deploy from your computer later).
4. **Project settings (gear icon) → General → Your apps → Add app → Web (</>together icon)**. Register it, then copy the `firebaseConfig` object shown.
5. Paste those values into `index.html` (search for `firebaseConfig`) AND into `firebase-messaging-sw.js` (same values, near the top).
6. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Copy the key into `index.html` as `VAPID_KEY`.

## 2. Deploy the app (Firebase Hosting)

On your computer, with Node.js installed:

```bash
npm install -g firebase-tools
firebase login
cd task-tracker
firebase use --add        # pick your project, alias "default"
firebase deploy --only hosting,firestore:rules
```

Firebase gives you a live URL like `https://your-project.web.app` — that's your app, open it on PC or phone.

## 3. Daily reminder (GitHub Actions)

1. Push this folder to a **public** GitHub repo (public keeps Actions minutes unlimited and free — your Firebase keys inside `index.html` are meant to be public, that's normal for Firebase web apps; the sensitive keys below go in Secrets, never in the code).
2. Firebase console → Project settings → **Service accounts** → Generate new private key → downloads a JSON file.
3. In your GitHub repo → Settings → Secrets and variables → Actions → New repository secret, add three secrets:
   - `FIREBASE_SERVICE_ACCOUNT` — paste the entire content of that JSON file
   - `GMAIL_USER` — your Gmail address
   - `GMAIL_APP_PASSWORD` — a Gmail **App Password** (not your normal password): Google Account → Security → 2-Step Verification (turn on if needed) → App passwords → generate one for "Mail"
4. That's it — the workflow in `.github/workflows/reminder.yml` runs automatically every day at 8:05 am Dhaka time. You can also trigger it manually from the Actions tab ("Run workflow") to test it immediately.

## 4. Security — read before relying on this long-term

`firestore.rules` currently allows anyone with your Firestore URL to read/write your data (no login screen exists yet). This keeps the app simple to start with, but it means your task list isn't private. When you're ready, tell Claude and we'll add a simple email/password login — it's a small addition, not a rebuild.

## Notes

- The three old Google Sheet tabs (Official/Personal/Birthday) are now just the filter pills at the top of the app — no separate pages needed, since filtering is instant.
- Task IDs (`Official-2026-Jul-05` style) are generated automatically, same pattern as before.
- Recurring tasks (Daily/Weekly/Monthly/Yearly) auto-create the next task the day the current one's reminder fires — same as the Apps Script version.
