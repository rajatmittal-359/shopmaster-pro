# Pausing the box for a month, and starting it again (20 Sep 2026)

Rajat: "ho sakta hai thode mahine payment karoon, fir 1 mahine band, fir agle
mahine chalu." So the production box must be something you can switch off for
a month and switch on again in ten minutes, without losing anything.

Nothing lives on the box that cannot be rebuilt: the database is Atlas, the
images are Cloudinary, the code is GitHub, the two env files are copied in
`private/` on the laptop (`private/api.env.prod`). Deleting the instance loses
nothing but the certificate, which Caddy fetches again on its own.

## Pause (10 minutes, ~₹5 for the month)

1. Lightsail → Instances → `shopmaster-prod` → **Snapshots** → Create manual
   snapshot → name `shopmaster-prod-<date>` → wait for *Ready*.
   (Only the disk; ₹0.05 / GB-month → ₹3–5 for a 60 GB disk that is mostly empty.)
2. **DNS first, so nobody sees a dead IP:** Hostinger → DNS → `A www` and
   `A @` → the Render static site's IP (`216.24.57.1`, or the value shown on the
   Render domain screen) — the old site says "back soon" in effect. Or leave the
   records; the box is gone either way.
3. Lightsail → `shopmaster-prod` → **Delete** (confirm the snapshot exists first).
4. Lightsail → Networking → the static IP → **Delete / release**. An unattached
   static IP costs ₹0.4 / day — the one thing that keeps billing after the box.
5. Nothing else: the UPI mandate charges only what is used (₹0–5 next month);
   Atlas M0, Cloudinary, Brevo, GitHub are free and untouched. **Do not** cancel
   the mandate — that closes the account's payment method, not the cost.

Scheduled jobs (`.github/workflows/scheduled-jobs.yml`) will fail while paused
— expected; or point its `API` env back at the Render URL for the month.

## Resume (10 minutes)

1. Lightsail → Snapshots → the latest → **Create new instance** → Mumbai, same
   plan ($12) → name `shopmaster-prod` → Create. (A fresh instance + `bootstrap.sh`
   + the env files from `private/` works too, 15 minutes instead of 10.)
2. Networking → **Create static IP** → attach to the new instance → note it.
   Firewall on the new instance: 22, 80, **443** (a snapshot keeps the firewall).
3. GitHub → repo → Settings → Secrets → `LIGHTSAIL_HOST` = the new IP.
4. Atlas → `shopmaster-prod` project → Network Access → replace the old box IP
   with the new one (the database refuses the box until this is done).
5. Hostinger → DNS → `A www` and `A @` → the new IP (TTL 300 → live in minutes).
6. Actions → **deploy** → Run workflow (empty tag = build HEAD), or just push.
   `release.sh` pulls the current images and waits for both health checks;
   Caddy fetches the certificate once DNS resolves to the new IP.
7. Check: `https://www.shopmasterpro.in/api/health` → `{"ok":true,"db":"up"}`.

## What a snapshot does NOT carry

- The static IP (always new after a resume → steps 2–5 above).
- Anything in Atlas — nothing to carry; the database never paused.
