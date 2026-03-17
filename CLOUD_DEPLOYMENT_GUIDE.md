# دليل النشر السحابي المجاني - Fleet Tracker

هذا الدليل يشرح كيفية نشر السيرفر على الإنترنت مجاناً بحيث يعمل التطبيق من أي مكان بدون الحاجة لكمبيوتر محلي.

## الخدمات المستخدمة (مجانية بالكامل)

| الخدمة | الاستخدام | الحد المجاني |
|--------|-----------|-------------|
| **Render.com** | استضافة السيرفر | مجاني (ينام بعد 15 دقيقة بدون طلبات) |
| **Neon.tech** | قاعدة بيانات PostgreSQL | 512 MB مجاناً |
| **GitHub** | تخزين الكود | مجاني |

---

## الخطوة 1: رفع الكود على GitHub

### 1.1 إنشاء حساب GitHub
- اذهب إلى [github.com](https://github.com) وسجل حساب جديد

### 1.2 إنشاء مستودع جديد
- اضغط على زر **"New"** أو **"+"** في أعلى الصفحة
- اختر اسم مثل: `fleet-tracker`
- اجعله **Private** (خاص)
- اضغط **Create repository**

### 1.3 رفع الكود
افتح Terminal في مجلد `fleet-tracker/server` واكتب:

```bash
cd fleet-tracker/server
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fleet-tracker.git
git push -u origin main
```

> استبدل `YOUR_USERNAME` باسم حسابك على GitHub

---

## الخطوة 2: إنشاء قاعدة بيانات مجانية (Neon.tech)

### 2.1 إنشاء حساب
- اذهب إلى [neon.tech](https://neon.tech)
- سجل دخول بحساب GitHub

### 2.2 إنشاء مشروع جديد
- اضغط **"Create Project"**
- اختر اسم: `fleet-tracker`
- اختر المنطقة الأقرب لك (مثلاً: `aws-eu-central-1` لأوروبا)
- اضغط **"Create Project"**

### 2.3 نسخ رابط الاتصال
- بعد الإنشاء، ستظهر لك صفحة بها **Connection string**
- انسخ الرابط الذي يبدأ بـ `postgresql://` - ستحتاجه في الخطوة التالية
- مثال: `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`

---

## الخطوة 3: نشر السيرفر على Render.com

### 3.1 إنشاء حساب
- اذهب إلى [render.com](https://render.com)
- سجل دخول بحساب GitHub

### 3.2 إنشاء Web Service
- اضغط **"New"** → **"Web Service"**
- اختر **"Build and deploy from a Git repository"**
- اربط حسابك بـ GitHub واختر مستودع `fleet-tracker`

### 3.3 إعداد الخدمة
املأ الحقول كالتالي:

| الحقل | القيمة |
|-------|--------|
| **Name** | `fleet-tracker-api` |
| **Region** | اختر الأقرب لك |
| **Branch** | `main` |
| **Root Directory** | (اتركه فارغ إذا رفعت مجلد server فقط، أو اكتب `server` إذا رفعت المشروع كاملاً) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node src/index.js` |
| **Instance Type** | **Free** |

### 3.4 إضافة متغيرات البيئة
اضغط على **"Advanced"** ثم **"Add Environment Variable"**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | الصق رابط Neon.tech الذي نسخته في الخطوة 2.3 |
| `JWT_SECRET` | اكتب أي نص عشوائي طويل (مثلاً: `my-super-secret-key-12345-fleet`) |
| `NODE_ENV` | `production` |

### 3.5 النشر
- اضغط **"Create Web Service"**
- انتظر حتى يتم البناء والنشر (2-5 دقائق)
- بعد النجاح، ستحصل على رابط مثل: `https://fleet-tracker-api.onrender.com`

### 3.6 اختبار السيرفر
افتح المتصفح واذهب إلى:
```
https://fleet-tracker-api.onrender.com/api/health
```
يجب أن ترى: `{"status":"ok","timestamp":"..."}`

---

## الخطوة 4: ربط التطبيق بالسيرفر السحابي

### 4.1 تحديث إعدادات التطبيق
افتح ملف `mobile/constants/config.ts` وغيّر:

```typescript
export const APP_CONFIG = {
  appName: 'Fleet Tracker',
  companyName: 'شركة التوصيل',

  // ← غيّر هذا لرابط Render
  serverHost: 'fleet-tracker-api.onrender.com',
  serverPort: '443',

  get serverUrl() {
    // استخدم https للسيرفر السحابي
    if (this.serverPort === '443') {
      return `https://${this.serverHost}`;
    }
    return `http://${this.serverHost}:${this.serverPort}`;
  },
};
```

> استبدل `fleet-tracker-api.onrender.com` بالرابط الفعلي من Render

### 4.2 بناء APK جديد
```bash
cd mobile
eas build -p android --profile preview
```

---

## الخطوة 5: بيانات الدخول الافتراضية

عند أول تشغيل، يتم إنشاء حسابين تلقائياً:

| الدور | اسم المستخدم | كلمة المرور |
|-------|-------------|-------------|
| مدير | `admin` | `admin123` |
| موظف | `employee` | `employee123` |

> **مهم:** غيّر كلمات المرور فوراً بعد أول تسجيل دخول!

---

## ملاحظات مهمة

### السيرفر المجاني ينام
- سيرفر Render المجاني ينام بعد **15 دقيقة** بدون طلبات
- أول طلب بعد النوم يأخذ **30-60 ثانية** للاستيقاظ
- هذا طبيعي ولن يؤثر على الاستخدام اليومي

### للحفاظ على السيرفر نشط (اختياري)
يمكنك استخدام خدمة مجانية مثل [UptimeRobot](https://uptimerobot.com) لإرسال طلب كل 14 دقيقة:
- سجل حساب مجاني
- أضف Monitor جديد من نوع HTTP
- ضع الرابط: `https://fleet-tracker-api.onrender.com/api/health`
- اختر الفترة: كل 5 دقائق

### الترقية المستقبلية
إذا احتجت أداء أفضل، يمكنك الترقية إلى:
- **Render Starter**: $7/شهر (لا ينام + أسرع)
- **Neon Pro**: $19/شهر (قاعدة بيانات أكبر)

---

## استكشاف الأخطاء

### السيرفر لا يعمل
1. تحقق من Render Dashboard أن الخدمة "Live"
2. اضغط على "Logs" وابحث عن أي أخطاء
3. تأكد أن `DATABASE_URL` صحيح

### التطبيق لا يتصل بالسيرفر
1. تأكد أن الرابط في `config.ts` صحيح
2. تأكد أنك تستخدم `https` وليس `http`
3. جرب فتح `/api/health` في المتصفح

### خطأ في قاعدة البيانات
1. اذهب إلى Neon Dashboard
2. تحقق أن المشروع نشط
3. جرب نسخ Connection string جديد وتحديثه في Render
