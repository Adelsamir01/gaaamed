# Dedos — Play Console publish progress

App: **Dedos — ديدوس** | Package `com.dedos.game` | Play Console app ID `4974812725089053960`
Developer account: Adel Samir (`adelelzemity@gmail.com`), ID `6487966622911672014`
Browser session: `dedos-play-publish` (Kimi WebBridge)

| Step | State | Notes |
|---|---|---|
| Create app | ✅ DONE | Arabic default, Game, Free, declarations accepted. Screenshot `01-app-created-dashboard.png` |
| Listing: app name | ✅ prefilled | `Dedos — ديدوس` (13/30) |
| Listing: short desc (AR) | ✅ SAVED (draft) | 61/80 chars, persists after reload |
| Listing: full desc (AR) | ✅ SAVED (draft) | 1312/4000 chars, persists after reload. Screenshot `03-listing-text-saved.jpg` |
| Listing: contact email | ✅ SAVED | Store settings → contact details; persists after reload (`06-store-settings-contact-saved.png`) |
| Listing: website | ✅ SAVED | `https://dedos.adelsamir.com`; persists after reload |
| Listing: category = Casual | ⚠️ SKIPPED | App=Game saved, but "Category: Select a category" Edit dialog would not open after 3 JS click/pointer attempts (no `.cdk-overlay-pane` appears). User: Store settings → App category → Edit → Category → Casual → Save (30 s) |
| Listing: privacy URL | ⬜ TODO | `https://dedos.adelsamir.com/privacy` — enter in Policy → App content → Privacy policy |
| Listing: app icon | ⚠️ PARTIAL | Uploaded to asset library OK, but ATTACH to slot failed 4× (synthetic drag/pointer/click; `setFileInputFiles` = "Not allowed"; tab hidden so no trusted input) — **SKIPPED** per stuck policy |
| Listing: feature graphic | ⬜ TODO | Same attach issue expected |
| Listing: phone screenshots | ⬜ TODO | Try shot-1 + shot-3 only (2 required) |
| Internal testing release 1.0 + AAB | ✅ ROLLED OUT | AAB `app-release.aab` (5,130,264 B) in release 1 (track `4700649389282703735`). Testers email list "Dedos testers" (1 user: `adelelzemity@gmail.com`) created + attached + page Saved 2026-07-17 ~22:50. Review page had 1 benign warning only ("There is no deobfuscation file associated with this App Bundle…"). Confirmed "Publish change on Google Play?" → track now **Active**, release "1 (1.0) — Available to internal testers · Released on Jul 17 10:58 PM · Not reviewed". Screenshots `20-internal-testing-review.png`, `21-internal-testing-active.png` |
| Data safety | ✅ SUBMITTED | All 5 wizard steps saved server-side 2026-07-17 ~22:41. Collects=Yes, encrypted=Yes, deletion=Yes (+URL), no account creation. 7 data types, all Collected-only (never Shared), ephemeral=No: Name (optional, App functionality), User IDs (required, App functionality + Account mgmt), Other info (optional, App functionality + Personalization), Other in-app messages (optional, App functionality), Other UGC (optional, App functionality), Other actions (required, App functionality), Device or other IDs (required, App functionality + Account mgmt). Per-type forms re-filled after 2 client-only-save wipes; persisted via page-level "Save draft" → reload → all 7 rows still "Completed" → Step 5 Preview → "Save" → banner "Change saved. Send for review in Publishing overview." Screenshots `18-step5-preview.png`, `19-data-safety-saved.png` |
| Content rating (IARC) | ✅ SUBMITTED | All content Qs=No, gambling=No (both), Users Interact=Yes (block=No, report=No, friends-only=No, chat moderation=No), location=No, purchases=No. Ratings: ESRB Everyone, ACB General, ClassInd/GRAC All ages, Gmedia 3 — all with "Users Interact". Submitted 2026-07-17 19:08. Screenshot `09-iarc-submitted.png` |
| Privacy policy URL | ✅ SAVED | `https://dedos.adelsamir.com/privacy` in App content → Privacy policy; "Change saved" confirmed. NOTE: site must be publicly reachable before review |
| Target audience 13+ | ✅ SAVED | 13-15, 16-17, 18 and over; wizard auto-skipped child-directed steps; "Change saved" confirmed |
| Ads = No | ✅ SAVED | "No, my app does not contain ads"; "Change saved" confirmed |
| App access = no special access | ✅ SAVED | "Is any part of your app restricted? → No"; "Change saved" confirmed |
| Countries = all | ✅ N/A | Internal testing track rolled out without asking for countries |
| Production draft | ⬜ not started | next manual step — see FINAL REPORT below |

## Environment quirks (for resume)
- Play Console tab reports `visibilityState: hidden` → CDP trusted mouse/keyboard and `DOM.setFileInputFiles` do NOT work ("Not allowed").
- File upload workaround that WORKS: chunk file as base64 via `evaluate` into `window.__b64_*`, assemble `new File` + `DataTransfer`, assign to `input.files`, dispatch `change`. Files land in the console's asset library / uploader.
- `fetch`/`<img>` to `http://127.0.0.1:*` from the console page stalls (Private Network Access) — do not rely on localhost servers.
- Screenshot tool intermittently returns empty (silent fail) — retry once; if still failing, reload tab.
- `.webbridge/mkchunks.py <file> <outdir> <tag>` generates chunk request JSONs; push with curl loop, then assemble in page.

## Log
- 12:53 — Blocker found: `com.dedos.app` package taken (screenshots `00-blocker-*`). Reported.
- 13:20 — New package `com.dedos.game`; app created (ID 4974812725089053960).
- 13:55 — Listing text filled; icon uploaded to library; attach-to-slot attempts began.
- 15:16 — Status screenshot `02-status-store-listing-icon-in-library.png`; still stuck on attach.
- 16:05 — STUCK POLICY applied: icon attach SKIPPED (4 failed attempts). Moving to text save + release + policy. Screenshot tool degraded (2 silent failures); will save draft then reload tab.
- 16:30 — Listing text SAVE CONFIRMED (draft persists after reload). Workaround for screenshots: default temp path + copy into console/. Next: Store settings (contact email/website) → privacy URL → internal testing AAB → policy forms.
- 18:14 — Contact details CONFIRMED SAVED server-side (email + website persist after full reload). Category=Casual SKIPPED (Edit dialog won't open via JS, 3 attempts). Screenshot `06-store-settings-contact-saved.png`. Next: internal testing AAB.
- 18:24 — INTERNAL TESTING DRAFT SAVED: 115 AAB chunks pushed (0 fail), File attached to `.aab` input, release auto-named, "Changes saved" banner. Screenshot `07-internal-testing-aab-draft.png`. Next: policy forms (App content).
- 18:49 — POLICY 3/6 SAVED: Ads=No ✓, App access=No restrictions ✓, Target audience=13-15/16-17/18+ ✓ (all "Change saved" banners). App content overview URL is `app-content/overview` (bare `/app-content` bounces to app-list). Screenshot `08-policy-3-saved-ads-access-audience.png`. Next: privacy URL → IARC → data safety.
- 19:14 — PRIVACY URL SAVED ✓ + IARC SUBMITTED ✓ (ESRB Everyone + Users Interact; certificate pending). 5/6 declarations done. Screenshot `09-iarc-submitted.png`. Next: Data safety (last form).
- 22:41 — DATA SAFETY SUBMITTED ✓ (6/6 declarations). All 7 per-type forms re-filled (Name, User IDs, Other info, Other in-app messages, Other UGC, Other actions, Device or other IDs) after learning popup-Save alone doesn't persist; page-level "Save draft" → reload → all rows still Completed → Step 5 → Save → "Change saved. Send for review in Publishing overview." Key quirk: hidden tab needs a CDP screenshot after opening a popup before `getBoundingClientRect` returns real layout. Next: internal-testing rollout check.
- 22:59 — INTERNAL TESTING ROLLED OUT ✓: created testers list "Dedos testers" (adelelzemity@gmail.com) via Create email list dialog (email chip needed focus+composition events; confirm dialog "Create email list?" → Create) → page Save → "2 of 3 complete" → "Preview and confirm the release" → review page 1 benign warning (no deobfuscation file) → "Save and publish" → confirm dialog "Publish change on Google Play? This change will be published immediately. Changes usually appear on Google Play within 1 hour, but can occasionally take longer." → track ACTIVE, release 1 (1.0) "Available to internal testers · Not reviewed". Screenshot `21-internal-testing-active.png`. ALL PLANNED AUTOMATION WORK COMPLETE.
