# Quill: deploy as an installable app

Quill is static files only. No server to run. Books never leave the reader's device.

## Deploy (pick one, all free)
- **Netlify Drop:** drag this folder onto https://app.netlify.com/drop
- **Vercel:** `npx vercel --prod` in this folder
- **GitHub Pages / Cloudflare Pages:** push the folder, serve the root

It must be served over **HTTPS** (localhost also works). Installing and offline use need that.

## Install
- **Android / Chrome / Edge:** open the URL, then menu, "Install app"
- **iPhone / iPad (Safari):** Share, "Add to Home Screen"
- Once opened online one time, the app and the PDF engine are cached and work offline.

## Accounts and sync (optional, Supabase)
Syncs reading positions, shelf order, colours, groups and settings (a few KB per person). Books and PDFs never leave the device.
1. Create a free project at https://supabase.com
2. SQL Editor: paste and run `supabase.sql`
3. Project Settings, API: copy the **Project URL** and the **anon public** key into `config.js`
4. Authentication, Providers: keep Email on. If "Confirm email" is on, new users confirm by email before signing in.
5. Redeploy. The "..." menu now shows Sign in / Create account.

After signing in on a second device, add the same PDF once; Quill recognises it and jumps to your position.
Only ever put the **anon** key in `config.js`, never the `service_role` key.
Sync is last-write-wins per book, so if two devices read the same book at once, the newer position wins.

## Updating
Replace the files and redeploy. The service worker version changes with the content, so readers pick up the new version on their next visit.

## What is in the box
- `index.html`: the whole app
- `config.js`, `supabase.sql`: optional accounts and sync
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and install
- `vendor/pdfjs/`: Mozilla pdf.js (Apache-2.0, see its LICENSE), used to read PDFs offline

## Known limits
- Listening uses the device's built-in voices. Quality depends on the phone.
- iPhone stops speech when the screen locks (an iOS Web Speech limit).
- Scanned PDFs need the optional OCR step, which downloads its engine once from a CDN.
- Without Supabase configured, use Backup in the "..." menu to move books between devices.
