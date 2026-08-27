# HouseFin SaaS

אפליקציית ניהול תקציב משפחתי עם התחברות, שמירת נתונים בענן, ומנוי פרימיום ב-Stripe.

## הרצה מקומית

```powershell
cd C:\Users\USER\Desktop\YarhiPro-Web\standalone\housefin
copy .env.local.example .env.local
npm install
npm run dev
```

נפתח ב-http://localhost:3001

## מה חייבים להגדיר

1. **פרויקט Supabase חדש** (לא הפרויקט של YarhiPro — כאן נתונים פיננסיים של משפחות).
2. SQL Editor → להריץ את `supabase/schema.sql`.
3. Authentication → Email מופעל. לפיתוח אפשר לכבות Confirm email.
4. **Stripe**: מוצר מנוי חודשי ₪24.90, להעתיק `STRIPE_PRICE_ID`.
5. Webhook ב-Stripe לכתובת `https://YOUR_DOMAIN/api/stripe/webhook` עם אירועים:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. בפיתוח: `stripe listen --forward-to localhost:3001/api/stripe/webhook`

## אבטחה שנכנסה

- התחברות חובה למסך האפליקציה
- RLS: כל משתמש רואה רק את ה-workspace שלו
- סטטוס פרימיום מגיע מ-Stripe webhook, לא מכפתור בדפדפן
- משתמש חינמי לא יכול לשנות הלוואות דרך ה-API
- כותרות אבטחה (clickjacking, MIME sniffing, HSTS)
- מגבלת גודל לשמירת נתונים
