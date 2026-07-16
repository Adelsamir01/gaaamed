# بنك الحظ

لعبة محافظات مصرية أونلاين بواجهة موبايل أفقية، وسيرفر WebSocket هو المسؤول عن حالة اللعبة، وتشغيل كامل بـ Docker وCloudflare Tunnel.

## تشغيل محلي للتطوير

```bash
npm install
npm run dev
```

واجهة اللعبة: http://localhost:5173

صحة السيرفر: http://localhost:3001/health

## تشغيل Docker

```bash
docker compose up --build
```

البروكسي المحلي: http://localhost:8080

## النفق الحي

اعمل ملف `.env` من `.env.example` وحط قيمة `CLOUDFLARED_TOKEN`، وبعدها شغل:

```bash
docker compose --profile tunnel up --build -d
```

الدومين المستخدم:

```txt
https://bank-el7az.adelsamir.com
```

إعداد Cloudflare Tunnel لازم يوجه الدومين إلى:

```txt
http://proxy:80
```

ملاحظة: الصيغة اللي فيها شرطة `bank-el7az` هي الصالحة للدومين العام.

## تشغيل أحسن على آيفون

عشان اللعبة تفتح من غير شريط سفاري أو تبويبات:

1. افتح `https://bank-el7az.adelsamir.com` من سفاري.
2. دوس زر المشاركة.
3. اختار إضافة إلى الشاشة الرئيسية.
4. افتح بنك الحظ من الأيقونة الجديدة.
5. لف الموبايل بالعرض والعب.

## الاختبارات

```bash
npm test
```
