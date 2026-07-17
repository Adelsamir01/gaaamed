# Dedos — Google Play Release Checklist

Step-by-step from zero to a published internal-testing release. Work top to
bottom; check items off as you go. Commands are for Windows (Git Bash) from the
repo root unless noted.

---

## 0. Pre-flight (before touching Play Console)

- [x] Rebrand fully applied: Arabic جااامد → **ديدوس**, Latin `gaaamed` →
      **Dedos** in user-facing strings, `capacitor.config.ts` `appName`, and
      `android/app/src/main/res/values/strings.xml` `app_name`.
- [x] **Final `applicationId` / `namespace` decided**: `com.dedos.app`
      (applied in `android/app/build.gradle`; `MainActivity` moved to `com.dedos.app`). The applicationId is
      **immutable after the first AAB upload** — you cannot change it later
      without creating a new app listing. A matching choice would be
      e.g. `com.dedos.app`. (Code change owned outside this doc.)
- [ ] Privacy policy hosted at a **public URL** — required by Play Console
      for apps that collect personal data. Draft is `PRIVACY.md` at the repo
      root. Easiest hosting: **GitHub Pages** — push the repo, then
      *Settings → Pages → Deploy from branch → main /(root)*; the URL becomes
      `https://<github-user>.github.io/<repo>/PRIVACY.html`. Set a real
      contact email in place of every `[CONTACT_EMAIL]` first.
- [ ] Server reachable over TLS for reviewers: production WebSocket server
      (`server/server.js`) running behind the Cloudflare Tunnel (wss).
      Reviewers will play against real infrastructure.

## 1. Google Play Console account

- [ ] Register at <https://play.google.com/console> — **one-time $25 fee**.
- [ ] Complete identity verification (personal account: government ID; keep
      the legal name/address consistent).
- [ ] Note for **personal accounts created after Nov 2023**: before production
      access you must run a **closed test with at least 12 opted-in testers
      for the last 14 days**. Plan for this — it gates the public launch.
- [ ] Create the app: name `Dedos — ديدوس`, default language **Arabic (ar)**,
      type **Game**, Free.

## 2. Generate the upload keystore (one time)

Use a strong unique alias/passwords and **back the file up offline**
(password manager + encrypted drive). Losing the upload key is recoverable
only via Play support because we enroll in Play App Signing (step 4), but
treat it as irreplaceable.

```bash
keytool -genkeypair -v \
  -keystore dedos-upload-key.jks \
  -alias dedos-upload \
  -keyalg RSA -keysize 2048 -validity 10950 \
  -storepass <STORE_PASSWORD> -keypass <KEY_PASSWORD> \
  -dname "CN=<YOUR_NAME>, OU=<UNIT>, O=<ORG>, L=<CITY>, S=<STATE>, C=<2-LETTER-COUNTRY>"
```

- [x] Keystore created at **`android/app/dedos-upload.keystore`** (alias
      `dedos`, RSA 2048, ~27-year validity). It is covered by `.gitignore`
      (`*.keystore`) — never commit it; keep an offline copy too.
- [x] Passwords stored: `android/keystore.properties` (gitignored, read by
      Gradle) and full backup incl. certificate fingerprints in
      **`sdk-installer/dedos-keystore-BACKUP.txt`** (gitignored dir). Copy
      both into a password manager / encrypted offline drive as well.

## 3. Build the signed release AAB

Versioning lives in `android/app/build.gradle` → `defaultConfig`:

```gradle
versionCode 1        // integer, MUST increase with every upload
versionName "1.0"    // user-facing string
```

- [ ] Bump `versionCode` (and `versionName` when user-facing changes ship).
- [ ] Web bundle built and synced: `npm run android:sync`
      (`tsc -b && vite build`, then `npx cap sync android`).
- [x] Build the App Bundle (done 2026-07-17):

```bash
cd android
./gradlew bundleRelease          # on Windows CMD: gradlew.bat bundleRelease
```

- [x] Output exists: `android/app/build/outputs/bundle/release/app-release.aab`
      (built 2026-07-17, ~4.9 MB).
- [x] Signed with the upload key: `android/app/build.gradle` now has a
      `signingConfigs.release` block that reads credentials from the
      gitignored `android/keystore.properties` (only when the file exists),
      and `buildTypes.release` uses it. Verified with
      `jarsigner -verify` → `jar verified`, signed by the `dedos`
      certificate. (`minifyEnabled` intentionally left `false` for this pass.)

## 4. Enroll in Play App Signing

- [ ] On first upload, Play Console prompts to enroll in **Play App Signing**
      — accept. Google holds the app-signing key; your `dedos-upload` key is
      the upload key.
- [ ] Download and archive the **upload certificate** and the **app signing
      certificate** fingerprints from *Setup → App integrity* for future
      reference (needed if you ever add Google sign-in or APIs).

## 5. Store listing assets

Produced separately under **`store-assets/`** — confirm these specs:

- [ ] **App icon**: 512×512 px, 32-bit PNG, ≤ 1 MB.
- [ ] **Feature graphic**: 1024×500 px, JPG or 24-bit PNG (no alpha), ≤ 1 MB.
- [ ] **Phone screenshots**: minimum **2** (recommend 4–8), JPEG or 24-bit
      PNG, each dimension 320–3840 px, 16:9 or 9:16. Being produced under
      `store-assets/` (existing gameplay shots in `docs/screenshots/` and repo
      root are source material).
- [ ] Copy from `docs/play-store/store-listing.md`: app name, short
      description (AR + EN), full description (AR + EN), category
      **Games → Casual**, tags.
- [ ] Contact details: public email required (use the same `[CONTACT_EMAIL]`
      replacement), website optional.

## 6. Policy declarations (App content section)

- [ ] **Privacy policy**: paste the hosted public URL from step 0.
- [ ] **App access**: select "all functionality is available without special
      access". Add a reviewer note: no login exists — a profile is created
      automatically on first launch (device-based identity with optional
      @handle); online play needs an internet connection to the hosted server.
- [ ] **Ads declaration**: **No, the app contains no ads.**
- [ ] **Content rating**: complete the IARC questionnaire exactly per
      `docs/play-store/content-rating.md` (expected: Teen / PEGI 12 with
      "Users Interact").
- [ ] **Data safety**: fill exactly per `docs/play-store/data-safety.md`
      (collected: name, user IDs, avatar emoji, in-app messages, friends/drawings,
      game stats, app-generated device ID; encrypted in transit; nothing shared;
      deletion on request).
- [ ] **Target audience and content**: select age groups **13+** (e.g. 13–15,
      16–17, 18+). The app is **not designed for children** — do not target
      under-13 (would trigger the Families policy, and open chat is
      incompatible with it). Confirm the "not child-directed" attestations.
- [ ] **News apps / COVID / other declarations**: No as applicable.

## 7. First release — internal testing track

- [ ] *Release → Testing → Internal testing → Create new release*, upload the
      signed AAB from step 3.
- [ ] Release name e.g. `1.0 (1) — first internal`.
- [ ] Add testers (Google Group or email list — teammates' Gmail accounts),
      save the opt-in URL, install on at least one real device, and sanity
      check: launch, profile creation, one offline game, one online game,
      chat send/receive.
- [ ] Fix issues → bump `versionCode` → rebuild → re-upload (repeat as needed).

## 8. Path to production

- [ ] Promote to a **closed track** and satisfy the **12 testers / 14 days**
      requirement if the account is a post-Nov-2023 personal account.
- [ ] Answer the pre-launch report warnings that are actionable (crashes,
      accessibility, security).
- [ ] Promote to **Production** with staged rollout (start ~20%).
- [ ] Post-launch: keep `versionCode` monotonically increasing; update the
      Data Safety answers whenever data handling changes; renew nothing
      (Play App Signing keys don't expire on your side; the upload keystore
      validity of ~30 years covers the app's life).

---

### Quick reference

| Item | Value |
|---|---|
| Package (current, pre-rebrand) | `com.gaaamed.app` |
| minSdk / targetSdk | 24 / 36 (`android/variables.gradle`) |
| Version fields | `android/app/build.gradle` → `defaultConfig` |
| AAB output | `android/app/build/outputs/bundle/release/app-release.aab` |
| Upload keystore | `android/app/dedos-upload.keystore`, alias `dedos` (gitignored; credentials backup in `sdk-installer/dedos-keystore-BACKUP.txt` — also keep offline copies) |
| Privacy policy source | `PRIVACY.md` → host publicly (GitHub Pages) |
| Server | `server/server.js` behind Cloudflare Tunnel (wss, TLS) |
