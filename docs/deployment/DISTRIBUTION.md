# Distribution Guide — PWA + Android APK

Monad Mate ships as a Web3 dApp. There is no app-store dependency: users open it in
any browser, install it to the home screen as a PWA, or sideload the Android build.

---

## Option 1: Web dApp (default)

Nothing to distribute — the deployed URL is the product.

```
https://monad-mate-trust-api-production.up.railway.app
```

Users can sign in with an email or phone code (managed account, no seed phrase) or
connect MetaMask/Rabby on Monad testnet (chain id `10143`) and sign the EIP-191
login challenge.

---

## Option 2: Progressive Web App (Add to Home Screen)

The landing app already serves `landing/public/manifest.json`.

Checklist for a fully installable PWA:

- [x] `public/manifest.json` with `display: "standalone"`
- [x] `<link rel="manifest">` wired via `app/layout.tsx` metadata
- [x] HTTPS (satisfied by the Railway deployment)
- [ ] `public/service-worker.js` for offline caching
- [ ] 512×512 app icon at `public/icon-512.png`

Install flow for users:

1. Open the site in a mobile browser
2. Menu → "Add to Home Screen"
3. Launches standalone, no install prompt from any store

---

## Option 3: Android APK sideload

For testers and internal builds.

```bash
# On the device: Settings → Security → allow install from unknown sources
adb install monad-mate.apk
```

Or share a direct link:

```
https://monad-mate-trust-api-production.up.railway.app/download/monad-mate.apk
```

Recommended APK metadata:

- Package name: `studio.ainative.monadmate`
- Minimum SDK: 26
- Categories: Social, Lifestyle

---

## Store assets (if a store listing is added later)

```
dist/
  icon.png              # 512x512 PNG
  screenshot_1.png      # 1080x2340 — post an intent at a venue
  screenshot_2.png      # 1080x2340 — ranked candidates with reasons
  screenshot_3.png      # 1080x2340 — check-in and credential
  feature_graphic.png   # 1024x500 banner (optional)
```

Copy to reuse:

- Name: **Monad Mate**
- Tagline: Find someone to hang out with in the mall you're already in.
- Short description: Post what you want to do in the next hour and match with
  someone at the same venue. A small MON deposit keeps you both honest.
- Long description: Monad Mate matches people who are in the same mall or
  supermarket right now and want to do the same thing in the next hour. An AI
  agent ranks candidates who share your venue, window, and intent and explains
  why. Both sides put up a small MON deposit as a commitment to their own
  attendance; a GPS or QR check-in returns it and mints a soulbound credential
  recording that you kept your word — never who you met.

---

## Notes

Distribution is PWA-first with an APK fallback: Monad has no first-party app store,
and the dApp runs entirely in the browser.
