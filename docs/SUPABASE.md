# Supabase (מקביל ל-Firebase)

## מה כבר בקוד
- חיבור: `lib/supabase.ts`
- הרשמה/התחברות: דרך Supabase כשהוא מוגדר (Firebase נשאר למשתמשים ישנים)
- הפרדת נתונים: כל קבלן רואה רק את ה-workspace שלו (RLS)
- אישור מנהל: `/admin/approve` מנסה קודם Supabase ואז Firebase

## שלב חובה בקונסולת Supabase

### 1. הרצת Schema
1. פתח [Supabase SQL Editor](https://supabase.com/dashboard)
2. העתק את כל התוכן מ־`supabase/schema.sql`
3. Run

### 2. Authentication
1. **Authentication → Providers → Email** — מופעל
2. מומלץ לפיתוח: כבה **Confirm email** (כדי שהרשמה תיכנס מיד)

### 3. משתני סביבה (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_or_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

את ה-**service role** לוקחים מ־Project Settings → API → `service_role` (סודי — רק בשרת).

ב-Vercel: הוסף את אותם משתנים ב-Environment Variables.

### 4. בדיקה
1. `npm run dev`
2. הרשמה עם אימייל חדש → אמור להיות "ממתין לאישור"
3. `/admin/approve` עם הסיסמה + האימייל → מאשר
4. התחברות מחדש → רואה רק את הנתונים שלו

## Firebase
לא נמחק ולא מנותק. משתמשים ישנים ממשיכים דרך Firebase.
