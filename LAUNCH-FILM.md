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

## 4. LinkedIn — 75 sec, 4:5 (and a 16:9 export)

**No voice-over.** Text on screen, Linear-style: one statement, one proof,
cut. Muted by default, read by engineers and by people who might hire.

| Time | Line on screen | Picture under it |
|---|---|---|
| 0:00–0:04 | Same-day delivery. In Jaipur. | the badge appearing |
| 0:04–0:10 | Most marketplaces: five days. | a five-day date |
| 0:10–0:16 | This one: today. | the date flipping |
| 0:16–0:26 | The seller writes nothing. | one photo in, full listing out |
| 0:26–0:36 | No GST required to sell. | enrolment-number path through sign-up |
| 0:36–0:46 | Courier booked automatically. | booking → label → tracking |
| 0:46–0:56 | Every rupee accounted for. | payout ledger, commission line |
| 0:56–1:06 | 106,243 lines · 1,653 tests · 13 integrations | counters ticking up |
| 1:06–1:15 | Built solo. In production. | mark, shopmasterpro.in |

The last card is the whole point of the LinkedIn cut. Say it plainly and stop.

---

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
4–10   Most marketplaces: five days.        (5-din ki date)
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

## 7. Still open before a frame is shot

1. **Source quality test** — Playwright's webm recording vs a full-res PNG
   sequence animated in Remotion. Ten minutes, and it decides everything
   after it. Bad source makes good motion pointless.
2. **Three to five reference launch films**, watched by Rajat — playbook
   step 1. The script above is written from the product, not from a reference
   film, and that gap is the one thing it has not had.
3. **Styleframes gate** — five stills, his yes, then build.
