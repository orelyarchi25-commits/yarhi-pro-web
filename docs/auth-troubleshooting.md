# בעיות התחברות / הרשמה / איפוס סיסמה

## «expired or the link has already been used»

זו הודעה של **Firebase**, לא של האתר. בדרך כלל:

1. **תצוגה מקדימה של המייל** – שירותי מייל (ג׳ימייל, אאוטלוק וכו’) לפעמים **פותחים את הקישור ברקע** לפני שלחצת – הקוד חד־פעמי **נשרף**.
   - **מה לעשות:** בקש **קישור חדש** ב«שכחתי סיסמה», ואז פתח את המייל ב־**גלישה בסתר** או **העתק את הקישור** (לחיצה ימנית → העתקת כתובת) והדבק בשורת הכתובת – **לחיצה אחת בלבד**.

2. **קישור ישן** – תוקף מוגבל (בדרך כלל שעה).
   - בקש מייל חדש.

3. **דומיין לא מורשה** – ב־Firebase Console → **Authentication** → **Settings** → **Authorized domains**  
   הוסף את הדומיין שבו רץ האתר (למשל `localhost`, ודומיין הפרודקשן).

4. **מפתח API מוגבל בטעות** – ב־Google Cloud Console → **APIs & Services** → **Credentials**  
   אם יש **Application restrictions** על מפתח ה־API, ודא שלא חוסם את Firebase Auth, או זמנית בטל הגבלה לבדיקה.

5. **אותו פרויקט** – ודא ש־`NEXT_PUBLIC_FIREBASE_PROJECT_ID` ב־`.env.local` תואם לפרויקט בקונסולת Firebase (במצב dev מוצג שורת עזר בדף ההתחברות).

## לא ניתן להתחבר או להירשם

- **Authentication** → **Sign-in method** → **Email/Password** חייב להיות **מופעל**.
- **Firestore Rules** – אם הרשמה נכשלה באמצע, ייתכן משתמש ב־Auth בלי מסמך – ראה `docs/FIREBASE.md`.

## דף `/auth/action`

אם תגדיר ב־Firebase **תבנית מייל** עם **Action URL** לאתר שלך (למשל `https://yourdomain.com/auth/action`), אפשר להשלים איפוס סיסמה ישירות באתר. ברירת המחדל של Firebase שולחת לדף של `*.firebaseapp.com`.
