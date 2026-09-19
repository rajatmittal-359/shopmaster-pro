# Launch video — the plan, for the day the site is live

Written 19 Sep 2026, before there is anything to film. Open this **after the
October cutover**, when the Next.js site is on the domain and the UI has
stopped moving. Everything here is free; nothing needs a card.

The look we want is the one Linear, Stripe and Apple use for product intros:
the real product on screen, smooth zooms, big calm text, good music, a few
mood shots. In those videos AI-generated footage is ~5 %; the other 95 % is
craft. So the plan is mostly craft, with AI where it actually helps.

---

## 0. Before you start (10 minutes)

- [ ] Site is live on `www.shopmasterpro.in`, real products, at least one real
      order placed and delivered (the video shows real screens, not seed data).
- [ ] Seed/TEST products hidden; announcement bar off; dark and light both look
      right (the video is shot in **light** mode - it reads better in feeds).
- [ ] Decide the one sentence the video is about. Suggested:
      **"Jaipur ki dukaan, poore India ke liye - ek din me online."**
      Everything that does not serve that sentence is cut.
- [ ] Length: **60 seconds** for the site hero, **30 seconds** cut for
      Instagram/LinkedIn (9:16). Not longer - the finish rate falls off a cliff
      after 60 s.

## 1. Script + shot list (Claude / ChatGPT, free)

Ask for: a 60-second script in Hinglish voice-over + English on-screen text,
6 scenes, one sentence each, with the exact screen to show. Structure that
works for marketplaces:

| # | Seconds | Scene | What is on screen |
|---|---|---|---|
| 1 | 0–6 | The problem | Mood shot: a Jaipur shop, a phone on the counter (AI clip or a real 5-second phone shot of a bazaar) |
| 2 | 6–18 | Selling is simple | Seller panel, Hindi on: *bol ke listing* - speak → product form fills itself → one tap → live |
| 3 | 18–30 | Buying is trust | Storefront: product page with the return promise, "Sold by", same-city delivery; checkout in 3 taps |
| 4 | 30–42 | The order runs itself | Order → courier booked → tracking → delivered; bell + WhatsApp-style notifications |
| 5 | 42–52 | Money and fairness | Earnings page, invoice, Fair Returns tag on a parcel, "Ask ShopMaster" answering in Hindi |
| 6 | 52–60 | Close | Logo (the jharokha), the one sentence, `shopmasterpro.in`, "Sell on ShopMaster Pro" |

Rule: **no claims the site does not make.** Nothing about hallmark/purity,
nothing that names the house shop as the platform.

## 2. Product footage - the main thing

Two ways; use both.

**A. Remotion (React → video) — for the hero scenes 2, 3, 5.**
`remotion.dev` is free for individuals and small companies. You write scenes
as React components; it renders MP4. Why it fits us: the UI is already React,
the design tokens exist (`web/DESIGN.md`), zooms and text reveals are exact,
and **when the UI changes you re-render instead of re-shooting**.
- `npx create-video@latest` → a `video/` folder beside `web/` (Rajat runs the
  install - never Claude).
- Scenes are built from **screenshots** of the live site (1440 px and 390 px),
  animated with zoom/pan + captions. Not the live app inside Remotion - too
  brittle.
- Ask Claude for the scaffold: composition at 1920×1080 and 1080×1920, a
  `<Zoom>` helper, a `<Caption>` with the brand font, the six scenes as
  placeholders. Then drop screenshots in.
- Alternative if Remotion feels heavy: **Motion Canvas** (TypeScript, open
  source, same idea).

**B. Screen recording — for anything that must move for real (scene 2's
voice → form, scene 4's tracking).**
- Windows: **OBS Studio** (free, no watermark). 1920×1080, 60 fps, record the
  browser window only. **Screenity** (open-source Chrome extension) is the
  lighter option.
- Smooth cursor: PowerToys → Mouse Utilities (highlight + larger pointer).
  Move the mouse slowly; every hesitation is visible at 60 fps.
- Browser: 125 % zoom, bookmarks bar hidden, a clean profile (no extensions
  showing), a test account with a real-looking name.
- Phone shots: Android screen recorder, then drop into a phone frame
  (Figma, free) - or record the phone with the laptop camera on a stand for
  the "real hands" feel.

## 3. Mood shots (AI video, 3–4 clips of 5 seconds, free tiers)

Only for scene 1 and transitions. Prompts: *"Jaipur bazaar at golden hour,
pink sandstone, a small shop front, cinematic, slow push-in"*; *"close-up of
hands wrapping a small gift box in tissue, warm light"*. **Never generate
jewellery or faces** presented as ours - that is the one claim that must be
real footage.

| Tool | Free allowance (Sep 2026) | Note |
|---|---|---|
| Google Flow (Veo) | ~50 credits/day for non-subscribers → a few clips/day | Best quality; check the watermark on export |
| Kling | ~66 credits/day, 720p, 5 s | Best motion; **watermark** - put text over the corner or crop |
| PixVerse | ~60 credits/day | No visible watermark in tests |
| Hailuo | 3–5/day | Backup |

Limits change monthly; check the day you start. Generate 3× more than you
need and keep the best.

## 4. Voice-over

- Option 1 (recommended): **your own voice**, phone in a quiet room under a
  blanket, then **Adobe Podcast Enhance** (free) to clean it. A real founder
  voice beats a synthetic one for trust.
- Option 2: **ElevenLabs** free (10k characters/month, Hindi/Hinglish voices).
  The free tier requires attribution for commercial use - put
  "Voice: ElevenLabs" in the video description.
- Hinglish, short sentences, one idea per scene. Read it aloud twice before
  recording; cut every word that does not survive.

## 5. Music

- **ElevenMusic** (free, ~7 songs/day, commercial use allowed) - prompt for
  "warm, modern, light percussion, no vocals, 60 seconds, builds at 45 s".
- Or royalty-free: YouTube Audio Library / Pixabay Music.
- **Not Suno on the free plan** - non-commercial licence.
- Music under the voice at −18 dB; let it rise only in scene 6.

## 6. Edit

- **DaVinci Resolve** (free, professional) - colour, audio ducking, titles.
- **CapCut desktop** (free) if you want auto-captions fast; know that it is
  ByteDance's - fine for a public promo, think twice for anything private.
- **Captions on, always** - most feed viewers watch muted.
- Export: 1920×1080 H.264 for the site (also a WebM); 1080×1920 for
  Instagram/LinkedIn; a 6-second silent loop (scene 3 or 4) for the site hero
  background if we want one.

## 7. Where it goes

- Home page: a "Watch how it works" button opening the 60 s video (lazy-loaded,
  poster image first - never autoplay with sound).
- `/sell` page: the 30 s seller cut above the apply wizard.
- YouTube (unlisted first, then public) → the embed; LinkedIn native upload;
  Instagram Reel from the 9:16 cut; WhatsApp status.

## 7b. Where a little money genuinely beats free (Rajat, 19 Sep: "faeda mile to de dunga")

The bar (Rajat, 19 Sep): **mention paid only when free genuinely cannot do
the thing AND the thing is necessary.** Held to that bar, honestly: nothing in
this plan *needs* money. Real footage can come from your own phone at the shop
(steady hands, golden hour, 10 clips of 8 seconds); zooms can be keyframed;
your own voice is free; ElevenMusic and Resolve are free. The table below is
the reference for the day you decide to spend anyway - ranked by how much
the paid thing adds. Prices are Sep 2026 list prices, approximate.

| Spend | ≈ Cost | What you get that free cannot | Verdict |
|---|---|---|---|
| **One day with a local videographer** (Jaipur; phone-gimbal or mirrorless) | ₹3,000–8,000 | Real bazaar, real shop counter, real hands packing a real order, real products. This is the footage AI cannot make honestly and the thing that makes the video *yours* | **Best rupee spent.** Do this before any subscription |
| **FocuSee** (Windows) - Screen Studio's equivalent | ~₹3,000–5,000 one-time | Auto zoom-to-cursor, smoothed pointer, click ripples, device frames - the "Linear look" in minutes instead of hours of keyframing in Resolve/Remotion | **Worth it** if you do not want to hand-animate; skip if the Remotion route is going well |
| **Google AI Pro** (Veo 3 in Flow) | ~₹1,950/month, cancel after 1 | 8-second clips with native sound, no watermark, far better than free Kling/PixVerse; 1 month covers the 3–4 mood shots ten times over | **Worth one month** if you want AI mood shots at all; skip entirely if the videographer day happens |
| **ElevenLabs Starter** | ~$5 (₹420)/month | Commercial licence without attribution, 30k characters, voice cloning (your own voice, re-usable for Hindi audio lessons later) | **Worth it only** if you go synthetic; your own recorded voice is still better for trust |
| **Kling / PixVerse paid** | ~$8–10/month | Removes the watermark, 1080p | Skip - Veo Pro month is better value if paying |
| CapCut Pro, Canva Pro, Epidemic Sound, stock-video sites | ₹400–2,000/month | Nothing the free Resolve + Pexels/Pixabay + ElevenMusic do not | **Don't** |
| Remotion licence | free for you | Paid only for companies with 4+ people | Nothing to pay |

Rule of thumb: **spend on real footage first, tools second, subscriptions
last** - and buy any subscription the week you edit, not before, so one
month is enough.

## 8. Order of work (one weekend)

1. Sat morning: script + shot list (1 h). Screenshots of the six screens
   (1 h). Remotion scaffold from Claude, drop screenshots in (2 h).
2. Sat afternoon: OBS recordings of the two live flows (1 h, do each 3×).
   AI mood clips in the background while recording (they take minutes).
3. Sun morning: voice-over (30 min), music (15 min).
4. Sun afternoon: Resolve - assemble, captions, colour, two exports (3 h).
5. Watch it on a phone, muted, once. If the story is clear muted, ship it.

---

*Update the allowances table the day you start - free tiers move every month.
When the video ships, add the links to OPS and delete this file's checklist.*
