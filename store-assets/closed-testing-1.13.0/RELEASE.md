# Dedos 1.13.0 — Closed testing

- Version code: 22
- Package: `com.dedos.game`
- Artifact: `Dedos-1.13.0-v22.aab`
- Build: signed release bundle
- Target SDK: 36
- Optimization: AGP 9, R8 minification, resource shrinking, and embedded obfuscation mapping
- Size: 3.95 MiB (4,142,074 bytes)
- SHA-256: `FA08FADAB5692941A0E05F6D483D89FBB3AE0D69CE3E3D5847A4088A3C2BE76E`

## Verification

- Production TypeScript and Vite build passed.
- Capacitor Android sync passed.
- Gradle release build and lint-vital checks passed.
- R8 minification and release signing passed.
- AAB signature verified and matches the live version 21 signing certificate.
- The bundle includes the baseline profile and embedded R8 mapping.

## Publishing safety

The server's mandatory-update floor remains at version code 21. Change it to 22 only after Google Play finishes publishing this release, otherwise existing users could be blocked before the update is available.

## Release notes

جديد في ديدوس:

- إضافة لعبة دومينو كاملة أوفلاين وأونلاين
- لوحة صدارة عالمية لكل لاعبي ديدوس
- لوحة صدارة مستقلة لكل لعبة مع ترتيبك ونقاطك
- تحسين كبير لسلاسة وثبات لعبة سيطر
- قائمة ألعاب أبسط وأسرع داخل الشات
- تحسين شكل نافذة تحديث التطبيق والأداء العام
