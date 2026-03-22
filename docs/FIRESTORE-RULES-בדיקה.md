# Firestore Rules עדיין לא עובד – בדיקה צעד־אחר־צעד

## 1. אותו פרויקט Firebase

- ב־**Firebase Console** למעלה בוחרים את **פרויקט Yarhi Pro** (או השם שלך).
- ב־**`.env.local`** בפרויקט: `NEXT_PUBLIC_FIREBASE_PROJECT_ID` **חייב להיות זהה** ל־**Project ID** שמופיע ב־Console (⚙️ Project settings → General).
- אם הערכים מפרויקט אחר – תתקן את `.env.local` ותפעיל מחדש `npm run dev` / `npm start`.

## 2. כללים ב־Firestore, לא ב־Storage

- **Firestore Database** → **Rules** (לא Realtime Database, לא Cloud Storage).

## 3. אין `match /{document=**}` עם `false`

אם **בנוסף** לכללים של `users` יש עדיין:

```text
match /{document=**} {
  allow read, write: if false;
}
```

– **מחק** את כל הבלוק הזה.  
הקובץ בפרויקט (`firestore.rules`) אמור להכיל **רק** את `match /users/{userId}` (כמו בקובץ המעודכן).

## 4. Publish

אחרי הדבקה ב־Console → **Publish** (חובה).  
אם יש **שגיאת תחביר**, Firebase לא ישמור – תקן עד שאין אדום.

## 5. מסד Firestore קיים

ב־**Firestore Database** → אם מבקשים **ליצור מסד** – צור אחד (מצב **Production** או **Test** לפי הרגלי העבודה שלך). בלי מסד – אין איפה לשמור.

## 6. בדיקה ב־Rules Playground (ב־Console)

ב־Firestore → **Rules** → **Rules** tab → יש לפתוח **Rules Playground** (אם יש):

- Location: `users/TEST_UID` (החלף `TEST_UID` ב־UID אמיתי מ־Authentication → Users אחרי הרשמה).
- Operation: **get** או **create**.
- Authenticated: **כן**, עם אותו `uid`.

**אמור** להיות **Allow** כשה־`uid` בנתיב תואם למשתמש המחובר.

## 7. אחרי שינוי Rules

רענון מלא בדפדפן (Ctrl+F5), או חלון גלישה בסתר – כדי לנקות מטמון.

---

אם אחרי כל זה עדיין שגיאה – העתק את **הטקסט המדויק** מהאדום בדף הכניסה או מ־**F12 → Console** (שורות Firestore / permission).
