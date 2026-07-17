# سياسة الخصوصية — ديدوس (Dedos) / Privacy Policy

> **مسودة للنشر / Draft for publication.**
> قبل الإرسال إلى Google Play: استبدل كل `[CONTACT_EMAIL]` بالبريد الحقيقي، وحدّث
> `[LAST_UPDATED]`. يجب استضافة هذه الصفحة على **رابط عام** (شرط إلزامي في Play
> Console). أسهل طريقة: **GitHub Pages** — من إعدادات المستودع:
> *Settings → Pages → Deploy from branch*، فيصبح الرابط:
> `https://<user>.github.io/<repo>/PRIVACY.html`.
>
> Before submitting to Google Play: replace every `[CONTACT_EMAIL]`, set
> `[LAST_UPDATED]`, and host this page at a **public URL** (Play Console
> requirement) — GitHub Pages is the easiest option.

آخر تحديث / Last updated: `[LAST_UPDATED]`

---

## سياسة الخصوصية (العربية)

### ١. نظرة عامة

ديدوس تطبيق ألعاب جماعية اجتماعي بالعربية: ألعاب أونلاين وأوفلاين، دردشة مع
الأصدقاء، ودعوات لعب. نحن نجمع **أقل قدر ممكن** من البيانات اللازمة لتشغيل
التطبيق — **بدون إعلانات، بدون تحليلات، بدون تتبع، وبدون مشتريات داخلية.**

### ٢. البيانات التي نجمعها

| البيانات | السبب | مكان التخزين |
|---|---|---|
| الاسم الذي تختاره (حتى ٢٤ حرفًا) | عرض هويتك للاعبين | خادمنا الخاص |
| المعرّف `@` الاختياري (٣–١٥ حرفًا إنجليزيًا صغيرًا/رقمًا/underscore) | إضافة الأصدقاء وإدارة الحساب | خادمنا الخاص |
| الأفاتار (إيموجي من اختيارك) | تخصيص البروفايل | خادمنا الخاص |
| معرّف داخلي عشوائي للجهاز (UUID يولّده التطبيق — ليس معرّفًا إعلانيًا ولا معرّف جهاز حقيقي) | ربط جهازك ببروفايلك بين الجلسات | جهازك + خادمنا الخاص |
| قائمة الأصدقاء | الميزات الاجتماعية | خادمنا الخاص |
| رسائل الدردشة النصية ودعوات اللعب (يُحتفظ بآخر ٢٠٠ رسالة في كل محادثة) | عمل الدردشة وعرض السجل | خادمنا الخاص |
| إحصائيات اللعب (العملات، نقاط الخبرة XP، المستوى، نتائج بنك الحظ) | التقدّم داخل اللعبة | جهازك (العملات وXP) + خادمنا الخاص (إحصائيات بنك الحظ) |

**لا نجمع أبدًا:** البريد الإلكتروني، رقم الهاتف، الموقع الجغرافي، جهات
الاتصال، الصور أو الفيديو، الصوت، أو أي بيانات دفع (لا توجد مدفوعات أصلًا).

### ٣. الحسابات

لا يوجد تسجيل ببريد إلكتروني أو كلمة مرور. يُنشأ بروفايل تلقائيًا عند أول
تشغيل ويُربط بجهازك، واختيار معرّف `@` اختياري تمامًا.

### ٤. كيف تُنقل وتُخزن البيانات

- كل الاتصالات بين التطبيق والخادم **مشفّرة أثناء النقل عبر TLS** (اتصال wss
  عبر Cloudflare Tunnel؛ تنتهي شهادة التشفير عند Cloudflare بصفتها مزوّد
  بنية تحتية يعالج المرور نيابةً عنا).
- البيانات الدائمة مخزّنة على **خادم ذاتي الاستضافة** (ملفات JSON في
  `server/data`) تحت سيطرتنا المباشرة.
- رسومات لعبة «شخبطة» تُنقل مباشرةً بين اللاعبين أثناء المباراة و**لا تُحفظ**.

### ٥. المشاركة مع الغير

**لا نشارك ولا نبيع بياناتك لأي طرف ثالث.** لا توجد حزم إعلانات أو تحليلات
أو تتبع داخل التطبيق. الجهة الوحيدة التي يمر عبرها المرور هي Cloudflare كمزوّد
بنية تحتية للتشفير والنفق فقط.

### ٦. الاحتفاظ بالبيانات وحذفها

- يُحتفظ ببيانات البروفايل والأصدقاء طالما كان حسابك نشطًا.
- يُحتفظ بآخر ٢٠٠ رسالة فقط في كل محادثة؛ الرسائل الأقدم تُحذف تلقائيًا.
- بيانات العملات وXP مخزّنة على جهازك فقط وتُحذف بإلغاء تثبيت التطبيق.
- لطلب **حذف حسابك وبياناتك من الخادم** راسلنا على `[CONTACT_EMAIL]` من داخل
  التطبيق أو مع ذكر معرّفك، وسنحذف بياناتك خلال ٣٠ يومًا.

### ٧. خصوصية الأطفال

التطبيق **غير موجّه للأطفال دون ١٣ عامًا** ولا نجمع بيانات منهم عن علم. إن
علمنا بوجود بيانات لطفل دون هذا السن سنحذفها فورًا — راسلنا على
`[CONTACT_EMAIL]`.

### ٨. التغييرات على هذه السياسة

قد نحدّث هذه السياسة من وقت لآخر؛ سننشر النسخة الجديدة على نفس الرابط مع تحديث
تاريخ «آخر تحديث».

### ٩. تواصل معنا

لأي سؤال أو طلب يخص الخصوصية: `[CONTACT_EMAIL]`

---

## Privacy Policy (English)

### 1. Overview

Dedos (ديدوس) is an Arabic social party-games app: online and offline games,
friend chat, and in-chat game invites. We collect the **minimum data needed
to run the app** — **no ads, no analytics, no tracking, and no in-app
purchases.**

### 2. Data we collect

| Data | Why | Where stored |
|---|---|---|
| Your chosen display name (up to 24 chars) | Shown to other players | Our self-hosted server |
| Optional `@handle` (3–15 lowercase letters/digits/underscore) | Adding friends, account management | Our self-hosted server |
| Avatar (an emoji you pick) | Profile personalization | Our self-hosted server |
| Random app-generated device ID (UUID — not an advertising ID, not a hardware ID) | Re-links your device to your profile | Your device + our server |
| Friends list | Social features | Our self-hosted server |
| Chat text messages and game invites (only the last 200 messages per thread are kept) | Chat functionality and history | Our self-hosted server |
| Game stats (coins, XP, level, Bank of Luck results) | In-game progression | Your device (coins/XP) + our server (Bank of Luck stats) |

**We never collect:** email address, phone number, location, contacts,
photos/videos, audio, or any payment data (there are no payments at all).

### 3. Accounts

There is no email/password registration. A profile is created automatically
on first launch and bound to your device; choosing an `@handle` is optional.

### 4. Transport and storage

- All app↔server traffic is **encrypted in transit via TLS** (wss over a
  Cloudflare Tunnel; TLS terminates at Cloudflare, which acts solely as an
  infrastructure provider processing traffic on our behalf).
- Persistent data lives on a **self-hosted server** (JSON files under
  `server/data`) under our direct control.
- Shakhbata (draw-and-guess) drawings are relayed live between players and
  are **never stored**.

### 5. Third-party sharing

**We do not share or sell your data to any third party.** The app contains no
advertising, analytics, or tracking SDKs. Cloudflare only carries encrypted
traffic as an infrastructure provider.

### 6. Retention and deletion

- Profile and friends data is kept while your account is active.
- Only the most recent 200 messages per chat thread are retained; older
  messages are deleted automatically.
- Coins/XP are stored on your device only and are removed by uninstalling.
- To request **deletion of your account and server-side data**, email
  `[CONTACT_EMAIL]` (include your @handle) and we will delete it within 30 days.

### 7. Children's privacy

The app is **not directed at children under 13** and we do not knowingly
collect data from them. If we learn of such data we will delete it promptly —
contact `[CONTACT_EMAIL]`.

### 8. Changes

We may update this policy; the new version will be posted at this same URL
with an updated "Last updated" date.

### 9. Contact

For any privacy question or request: `[CONTACT_EMAIL]`
