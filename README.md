# Quill: deploy as an installable app

Quill is static files only. No server to run. Without an account, books never leave the reader's device; signing in syncs a reader's shelf, including their books, to their own Supabase project so it follows them to another device.

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
Each account keeps its own shelf: book titles, order, colours, groups, settings, reading positions, and — once a reader signs in — the book text itself, so a signed-in reader's library follows them to another device without re-adding each file. Readers who never sign in keep working exactly as before, fully local to that device.
1. Create a free project at https://supabase.com
2. SQL Editor: paste and run `supabase.sql` (creates `folio_state` for positions/shelf order, and `folio_books` for book text — skip the `folio_books` part of the script if you'd rather keep sync limited to positions and shelf order, with book text staying device-only)
3. Project Settings, API: copy the **Project URL** and the **anon public** key into `config.js`
4. Authentication, Providers: keep Email on. If "Confirm email" is on, new users confirm by email before signing in.
5. Redeploy. The account icon in the header now shows Sign in / Create account.

A book added on one device appears on the shelf of any other device signed into the same account, and downloads there automatically the first time it's opened.
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
- Without Supabase configured, or without signing in, use Backup in the "..." menu to move books between devices.
