# Launch film — the script

Written 17 Oct 2026, from the research in `WHAT-IS-LEFT.md` §3 ("ShopMaster ka
LAUNCH FILM"). That entry holds the **method** — the Creator Studio playbook,
the capture rules, the formats, the token discipline. **This file holds the
WORDS**: what is on screen in each second, and why.

`LAUNCH-VIDEO.md` is the older free-tools plan (OBS, Resolve, ElevenMusic) and
is kept for the tool list. Where the two disagree, this file is newer.

---

## 0. The rules this script obeys

1. **Only what is true.** Every claim below is something the live site does
   today. The one thing deliberately NOT said is a delivery time in minutes:
   two real Borzo quotes on the live account came back ~70 minutes (2:50 am)
   and ~9.5 hours (6:50 pm). **"Same day" is safe. "70 minutes" is not.**
2. **Capture on localhost, never the live site** — the live site shows Google
   One Tap, and the browser rule is local-only.
3. **Fictional data only** in every frame. No real customer name, phone or
   address passes the capture.
4. **tez = texture, dheema = matlab.** The hook and any text the viewer must
   read run at 1x. Flows and scrolls run at 4–8x — they are there to show the
   thing is real, not to be read. Captions sit at roughly one second per three
   words.
5. **Captions burned in**, both platforms. People watch muted.

---

## 1. What films, and what does not

Decided by looking at each feature and asking "does this read in two seconds
without a sentence of explanation?"

**Films well — put it on screen, no caption needed**
- the same-day badge appearing when a Jaipur PIN is typed
- AI filling a listing from one photo
- the map / Jaipur frame
- the delivery date changing as the PIN changes
- a courier booking going through
- the assistant answering

**Needs a caption to mean anything — one line, then move on**
- the payout ledger
- the seller performance card
- returns with pack proof
- seller enrolment without a GSTIN
- the invoice

**Does not film at all, but counts — end card only**
- 106,243 lines
- 1,653 tests
- 13 integrations

These three numbers go up every week. **Re-measure them on the day the end
card is rendered** — `npm test`'s own last line for the test count, not the
number written here. A counter that is out of date on screen is the one claim
in the film anyone can check in ten seconds.

---

## 2. Master cut — 2:30

Everything is cut FROM this. The 75-second, 28-second and 15-second versions
are not separate shoots; they are selections from the same capture set.

| Block | Runs | What is on screen |
|---|---|---|
| Hook | 0:00–0:08 | PIN typed, same-day badge appears |
| The problem | 0:08–0:20 | a five-day delivery date, then today's date |
| Buying | 0:20–0:50 | shop → product → PIN → checkout → order placed |
| Selling | 0:50–1:30 | sign-up without a GSTIN → one photo → AI writes the listing → live |
| After the sale | 1:30–2:05 | order lands, courier booked, label, pack proof, payout ledger |
| Who runs it | 2:05–2:20 | Jaipur, the house shop, the map |
| End card | 2:20–2:30 | counters, mark, shopmasterpro.in |

Record every block at full length. Trimming is free; re-shooting is not.

---

## 3. Instagram Reel — 28 sec, 9:16, Hinglish

Hindi/Hinglish voice-over (Sarvam), captions burned in, **five beats only**.
Captions never longer than five words. **CTA goes in the pinned comment, not
in the video** — a link in a Reel kills reach.

| Time | Picture | Caption (burned) | VO |
|---|---|---|---|
| 0:00–0:03 | PIN `302019` typed, same-day badge pops | *Jaipur mein aaj hi* | — (let the badge land) |
| 0:03–0:07 | delivery date flips to today | *Order aaj. Delivery aaj.* | "Order aaj, delivery aaj." |
| 0:07–0:12 | real product grid scrolling | *Apne sheher ki dukaan* | "Apne hi sheher ki dukaan se." |
| 0:12–0:17 | one photo dropped, AI fills the listing | *Photo daalo. AI likhega.* | "Photo daalo — likhega AI." |
| 0:17–0:22 | sign-up, "I don't have a GSTIN" | *Bina GST bhi becho* | "GST nahi hai? Phir bhi becho." |
| 0:22–0:28 | Jaipur map, mark, wordmark | *shopmasterpro.in* | "ShopMaster Pro. Jaipur se." |

First frame must be the badge, not the logo. Nobody stays for a logo.

---

## 4. THE launch film - 45 sec, 4:5 - DESIGN v6 "Just an e-commerce site?" (20 Oct 2026)

**One picture, two soundtracks, both posted on LinkedIn AND Instagram** (Rajat,
20 Oct 2026): V1 = Aura Farming phonk baked in; V2 = narrator (ElevenLabs Brian,
paid month before posting) + a sound on every action + phonk-140. English only on
screen and in the voice (Hindi is a claim, never audio or subtitles).

### Why v5 was thrown away
Rajat: no hook, no thinking, a feature list. True. Backrr's film (out/backrr-hero-pro-vo-v1
and -song-LOCAL, the reference he chose) had one big idea ("Founders hear silence.
Investors hear noise."), a payoff in the first 3 s, pain on both sides, the logo on the
drop at 9 s, proof scenes, and a callback. v5 opened on a form.

### The big idea
People who see ShopMaster say *"it's just an e-commerce project - Amazon and Meesho
exist."* The film answers that line with work shown, not claimed: **one tap on "Buy"
opens into everything a marketplace really is**, built and run by one engineer.

### What we may claim, and what we may not (research 20 Oct 2026, sources in chat log)
- **Not:** cheaper (Meesho 0%, Flipkart fashion 0% since 8 Jul 2026, Amazon 0% referral
  under Rs 1,000 since 16 Mar 2026); fastest payout (Flipkart can pay 7 days from
  dispatch); only same-day (Amazon Local Shops; Borzo not live); only no-GST (Meesho
  enrolment IDs since 2023); first Hindi panel (Amazon 2020); "giants rig search"
  (only "CCI investigators found", no final order).
- **Yes:** refund only after the seller checks the return (pack-proof, receipt check,
  an admin with an AI brief of both sides); list by speaking (Hindi or English);
  ranking rules published (/how-we-rank - the house-shop and friend tiers do not touch
  ranking, checked in code); the engineering facts.
- **Numbers, counted 20 Oct 2026 (recount on render day):** 1,680 tests passing (180
  files), 232 API routes, 69 pages, 29 data models, 10 scheduled jobs, 27 AI modules,
  ~80,000 lines of app code + ~26,000 of tests, 3 panels (shop, seller, admin),
  2 couriers, live on AWS.

### Scenes (Backrr's shape; drop at 8.57 s = phonk-140-45 re-spliced to 5 bars)
| # | Time | On screen | Picture | V2 voice |
|---|---|---|---|---|
| 1 Hook | 0-3 | *"It's just an e-commerce site."* (a quote, struck through later) | A clean product page on a phone, 3D, slow push; a thumb taps **Buy now** | - |
| 2 Reveal | 3-8.6 | **"One tap. Behind it:"** then labels fly in | The phone splits into floating 3D layers, one per system, each a real screen: payment, GST invoice, courier booking, seller payout, fraud check, AI. Counters tick. Riser | "One tap. Behind it..." |
| 3 Drop | 8.6-10.3 | 3D mark, then **"Built by one engineer."** | Logo assembles on the hit | - |
| 4 AI | 10.3-14 | **Speak it. The listing writes itself.** chip "Hindi · English" | Real take: mic, transcript, form fills (zoom-punch on fill) | "Speak a product. The listing writes itself." |
| 5 Trust | 14-17.5 | **PAN checked. GST optional to start.** | Real take: PAN "Looks right", step 3 summary | "Sellers join in minutes." |
| 6 Money | 17.5-21 | **Rs 1,250 sale. Rs 1,150 paid in 7 days.** | Real take: calculator; a payout row slides in | "Every rupee, worked out before you join." |
| 7 Logistics | 21-24.5 | **Two couriers. One check.** | PIN check (standard date) + courier booking card | "Couriers booked in one tap." |
| 8 Fraud | 24.5-29 | **Empty box returned? Checked first.** | Empty-box photo -> pack-proof -> seller's "Not as sent" -> dispute open | "Refunds wait until the seller checks the box." |
| 9 Admin | 29-33 | **Disputes, briefed by AI. Decided by a person.** | Laptop, dark: AI brief streams; zoom | "Both sides, briefed. A person decides." |
| 10 Code | 33-36 | **1,680 tests. Passing.** | A terminal: the real `npm test` summary scrolling to "1680 passed" | "Tested. One thousand six hundred and eighty times." |
| 11 Callback | 36-45 | *"Just an e-commerce site?"* -> **"One engineer. Three apps. Live."** | Wall of every screen zooms out (Backrr's "Both sides" move); final hit 39.4 s: mark + shopmasterpro.in | "ShopMaster Pro. Built in Jaipur." |

Device rule: shop and seller on a phone (light), the operator on a laptop (dark).

### How it is built (the Backrr way, not v5's)
1. Styleframes first - one per scene, approved by Rajat before any motion.
2. The hook and reveal are designed motion (3D layers built in Remotion from the
   app's own tokens); proof scenes use the real Playwright takes inside 3D panels
   with zoom-punch on the moment that matters.
3. Sound design on every action (click, swipe, card drop, counter tick, impact).
4. Same picture -> V1 (song) and V2 (voice).

## 5. Stories / teaser — 15 sec, 9:16

Beats 1, 2 and 5 of the Reel. No VO, music only, one sticker-sized caption.
Ends on the wordmark with a swipe-up to the site.

---

## 6. WhatsApp — the script, as a message

The version Rajat pastes into a WhatsApp message (to himself, or to anyone who
is helping shoot it). Plain text: no tables, no markdown headings, short lines,
readable on a phone. Kept in sync with §3 and §4 above.

Copy from here:

```
*ShopMaster Pro — launch film script*
_17 Oct 2026_

*RULE:* "same day" bolna hai, "70 minutes" NAHI.
Do real Borzo quotes: ek 70 min, ek 9.5 ghante. Minute ka vaada jhooth ho jayega.
Capture localhost pe. Asli customer ka naam/phone/address kisi frame me nahi.

———————————
*1) INSTAGRAM REEL — 28 sec, 9:16*
Hinglish VO + captions burned. CTA pinned comment me, video me nahi.

0–3s  PIN 302019 type, same-day badge pop
      Caption: Jaipur mein aaj hi
      VO: —

3–7s  Delivery date aaj ho jaata hai
      Caption: Order aaj. Delivery aaj.
      VO: Order aaj, delivery aaj.

7–12s Product grid scroll (asli products)
      Caption: Apne sheher ki dukaan
      VO: Apne hi sheher ki dukaan se.

12–17s Ek photo daali, AI listing bhar deta hai
      Caption: Photo daalo. AI likhega.
      VO: Photo daalo — likhega AI.

17–22s Sign-up, "GSTIN nahi hai" wala rasta
      Caption: Bina GST bhi becho
      VO: GST nahi hai? Phir bhi becho.

22–28s Jaipur map, mark, wordmark
      Caption: shopmasterpro.in
      VO: ShopMaster Pro. Jaipur se.

Pehla frame badge ka, logo ka nahi.

———————————
*2) LINKEDIN — 75 sec, 4:5 (+16:9 export)*
VO nahi. Sirf screen pe text. Ek baat, ek proof, cut.

0–4    Same-day delivery. In Jaipur.        (badge aata hua)
4–10   Most orders: from a warehouse.   (door ka godown)
10–16  This one: today.                     (date badalti hui)
16–26  The seller writes nothing.           (1 photo -> poori listing)
26–36  No GST required to sell.             (enrolment number wala sign-up)
36–46  Courier booked automatically.        (booking -> label -> tracking)
46–56  Every rupee accounted for.           (payout ledger)
56–66  106,243 lines · 1,653 tests · 13 integrations
66–75  Built solo. In production.           (mark + shopmasterpro.in)

———————————
*3) STORIES TEASER — 15 sec*
Reel ke beat 1, 2 aur 5. VO nahi, music. Ant me wordmark + link.

———————————
*4) MASTER CUT — 2:30 (sab isi se katega)*
0:00–0:08  Hook — PIN, badge
0:08–0:20  Problem — 5 din vs aaj
0:20–0:50  Kharidna — shop, product, PIN, checkout, order
0:50–1:30  Bechna — bina GST sign-up, 1 photo, AI listing, live
1:30–2:05  Baad me — order, courier, label, pack proof, payout
2:05–2:20  Kaun chalata hai — Jaipur, ghar ki dukaan, map
2:20–2:30  End card — counters, mark, shopmasterpro.in

Poora record karna. Kaatna muft hai, dobara shoot karna nahi.

———————————
*SHOOT NOTES*
- Tez = texture, dheema = matlab. Hook aur padhne wala text 1x. Flow 4–8x.
- Caption ~1 second per 3 words. Dono platform pe BURN karni hai.
- Kya achha filmta hai: same-day badge, AI listing, map, date badalna,
  courier booking, assistant.
- Kya caption maangta hai: payout ledger, performance card, returns,
  enrolment, invoice.
- Kya film nahi hota par ginti me aata hai: 1,653 tests, 13 integrations,
  106,243 lines — sirf end card pe.
```

---

## 7. Decisions that are ShopMaster's own

ShopMaster's film is decided by ShopMaster's goals (seller recruitment,
buyer trust in Jaipur), not by any earlier film.

- **9:16 and 4:5 from the first scene**, not 16:9 cut down later.
- **WhatsApp cut gets its own small export** (Status takes about 16 MB).
- **Published music must be licensed:** Instagram - V1 bakes Aura Farming in
  (see §7d for the risk), with a silent export kept as fallback; LinkedIn/WhatsApp - Lyria or CC0. A downloaded
  song is for a local cut only.
- **Check remotion.dev/license before publishing.**

**Taken from Rajat's Backrr film** (`~/Desktop/backrr/backrr-launch-video/` - open it, it may have moved on), only where it serves our goal:
- **Two sides winning in one loop.** Our goal is seller recruitment AND buyer
  trust - a film that shows only the buyer recruits no seller.
- **Cut on the music's beat**, so swapping the track never means re-editing.
  Needed because the Reel's music is chosen in Instagram, late.
- **A sound on every click and swipe.** Muted viewers lose nothing; unmuted
  ones feel the product is quick.
- **Captions as editable props.** Rajat changes the words without calling Claude.
- **Shorter cuts trimmed from the master**, never re-made.

Left behind, because it does not serve ours: the 9-second build before the
music drops (a Reel loses people in 3), the English voiceover (our buyers and
sellers are Jaipur, Hinglish), and the dark purple look (ours is Jaipur pink
on light, `web/DESIGN.md`).

## 7b. LinkedIn first, and made once (decided 19 Oct 2026)

**The first film is LinkedIn's: ONE video** (§4's 75-second script), 4:5,
no voice-over, burned captions, native upload from Rajat's personal profile,
the link in the first comment. A document carousel ("how one person built a
marketplace") follows 5-7 days later. The seller and customer cuts for
Instagram and WhatsApp come later, from the same build.

It is motion graphics - real ShopMaster screens animated with kinetic text,
sound on every action, cut on the beat - not camera footage and not a raw
screen recording. Screens are **rebuilt in React** for the cleanest frame.

**Posted once, iterated until it is right (Rajat, 19 Oct 2026: "LinkedIn pe
upload ek baar karunga, dubara thodi karunga - last me iterations lagein chahe
jitne, par sahi cheez ho, maza aa jaaye dekh ke").** There is no render limit;
there is one upload. The order only makes each round cheaper:
1. Script locked, second by second.
2. 5 styleframes (stills): first frame, the badge, the seller calculator, the
   admin's ledger, the end card - look, colour and type.
3. A 5-second motion test: pace, beat and sound.
4. The full film - then as many rounds as it takes, scene by scene.
5. Loudness and caption check; upload test in LinkedIn without posting.
6. Post, once, when Rajat watches it and it lands.
Before step 2, Rajat collects 2-3 launch films he genuinely likes as the
reference for "like this".

**Platform limits - use Creator Studio's verified rules, not web searches**
(`npm run kit -- rules instagram:reel`, `src/platforms/rules.json`, official
sources, checked 2026-10-16): Instagram Reel up to 3 min; LinkedIn video 3 s to
10 min, 75 KB to 5 GB, ratio 1:2.4 to 2.4:1. Every cut here is far inside. The
studio has no WhatsApp rules: keep that cut under 30 s and 16 MB. It also marks
LinkedIn's "link in the first comment" penalty as unverified folklore - so the
link placement is a choice, not a rule. Run `kit check` before every export.

## 7d. Two versions, one picture (decided 20 Oct 2026)

**Update, same day (Rajat):** both versions go to BOTH LinkedIn and Instagram - not
one per platform. The film itself is now §4 design v6.

Same visuals, two soundtracks:
- **Version 1 - Phonk (Instagram):** only Mustafa Saboori's
  *Aura Farming* (110.6 BPM), **rendered WITH the song baked in** (Rajat,
  20 Oct 2026), cut on its grid from the local copy. Risk taken knowingly:
  Meta's rights check may mute or block a baked-in commercial song; if it
  does, re-upload the silent export and add the song in the app. V1 is for
  Instagram only - never LinkedIn, the website or ads.
- **Version 2 - Full (LinkedIn, website):** male voice-over + a sound on every
  click/swipe + background music, music ducked under the voice - the formula of
  Backrr's HeroProVO. **Music: `phonk-140` - FINAL (Rajat, 20 Oct 2026)**,
  picked after comparing ten tracks (Backrr's Lyria takes, two new Lyria
  clips, the studio's three). Made by Creator Studio's own code: no copyright,
  no licence, no cost. It is 31 s (drop 3.4 s, final hit 27.4 s), so the 45 s
  cut repeats one 8-bar groove section (13.7 s at 140 BPM) on the beat grid.
  cine1 was tried and dropped.
- **Sounds:** Backrr's 16 SFXMint UI sounds are reused (CC0, generic). Its 7
  ElevenLabs free-tier hits, its used Lyria take 1 and its Brian voice are NOT -
  they are Backrr's identity and free-tier ElevenLabs is non-commercial. New
  signature sounds from SFXMint (CC0), e.g. a ghungroo/bell shimmer on the
  same-day badge.
- **Voice:** a licensed male voice - Gemini TTS or Azure (free) first,
  ElevenLabs paid for one month only if the free ones fall short.

## 7c. Two machines (decided 20 Oct 2026)

**This Mac does everything** - script, styleframes, 2D motion, code-built 3D,
voice, music timing, every iteration and preview. **The Lenovo (RTX 3050, 4 GB)
does only the final heavy render** of the 3D scenes, and Blender's Cycles if a
shot ever needs it. The film's folder lives in git so the Lenovo only pulls and
renders - nothing is copied by hand. 3D stays to 3-4 moments (logo, phone,
parcel's trip, a jewellery piece from an AI-made model); 4 GB is enough for that.

**Assets on hand:** Creator Studio's `.env.mine` keys (Rajat's mother's
accounts, free to use): ElevenLabs (voice - Rajat to confirm the plan is paid
before publishing), Gemini/Lyria (music), Freesound, Pexels, Pixabay, Unsplash
(licensed sounds and footage), FAL (AI 3D models), Runway / Higgsfield (AI
video). Phonk: Ogryzek - AURA, WAV in ~/Downloads, 120 BPM, drop at ~24 s -
local timing only; the Reel gets it from Instagram's library.

## 8. Still open before a frame is shot

1. ~~Source quality test~~ - Playwright webm vs PNG sequence vs screens
   rebuilt as React components - decide by quality and effort. Left: list the ~8 ShopMaster screens the script needs.
2. **Three to five reference launch films**, watched by Rajat — playbook
   step 1. The script above is written from the product, not from a reference
   film, and that gap is the one thing it has not had.
3. **Know which post brought whom.** GA4 already counts the buyer funnel
   (`web/src/lib/analytics.js`) and reads UTM tags on its own, so every post's
   link carries `utm_source=instagram|linkedin|whatsapp&utm_campaign=launch`.
   **Seller side ✅ 19 Oct 2026:** an application now sends GA4
   `generate_lead` and Meta `Lead` (`sellerApplied`, `web/src/lib/analytics.js`,
   test `backend/tests/sellerLeadEvent.test.mjs`) - GST route only, no
   personal detail. Left for the posting day: put the UTM tags on each link.
   Read it in GA4: Reports > Engagement > Events > generate_lead, by
   session source.
   (Seen in Backrr's `user.signup_utm_*`, 19 Oct 2026.)
4. **Styleframes gate** — five stills, his yes, then build.
