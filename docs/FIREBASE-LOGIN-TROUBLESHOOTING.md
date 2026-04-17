# בדיקות התחברות ל-Yarhi Pro (Firebase)

## האם חייבים להגדיר `.env.local`?

**כן, כדי לעבוד מול Firebase אמיתי.**  
הפרויקט קורא את הגדרות Firebase רק מתוך `.env.local` (לפי `.env.local.example`).

אם אין `.env.local` תקין — האתר יעבוד במצב מקומי (ללא התחברות אמיתית לענן).

### סכנה נפוצה: `.env.local` לא תואם לפרויקט

אם ב־`.env.local` יש ערכים **מלאים** אבל מ**פרויקט Firebase אחר** (או ישנים), האפליקציה מתחברת לפרויקט הלא נכון:

- התחברות עם משתמש שלא קיים שם → שגיאת אימות
- או התנהגות מוזרה

**מה לעשות:** ב־Firebase Console → ⚙️ Project settings → Your apps → Web → וודא ש־`projectId` (וגם שאר השדות) **זהים** למה שב־`.env.local`, או **מחק** את `.env.local` זמנית כדי לבדוק עם ההגדרה המוטמעת בלבד.

---

## שלב אחרי שלב – מה לבדוק בקונסולת Firebase

### 1) Authentication → Sign-in method

- פתח **Authentication** → **Sign-in method**
- וודא ש־**Email/Password** מופעל (Enabled)

### 2) Firestore → Rules

- פתח **Firestore Database** → **Rules**
- העתק את התוכן מ־`firestore.rules` בפרויקט ולחץ **Publish**
- בלי Rules מתאימים, שמירת `users/{uid}` אחרי login נכשלת (או נתקעת) – תופיע הודעת שגיאה אדומה או timeout אחרי ~45 שניות

### 3) Authentication → Settings → Authorized domains

- וודא ש־`localhost` מופיע (לפיתוח)
- לפרודקשן: הוסף את דומיין האתר שלך

### 4) משתמש קיים

- **Authentication** → **Users** – וודא שהאימייל קיים
- אם יצרת משתמש ידנית בלי סיסמה – השתמש ב־**איפוס סיסמה** מהאתר

---

## מה קורה בקוד אחרי לחיצה על "כניסה"

1. `signInWithEmailAndPassword` – אימות מול Firebase Auth  
2. `setDoc` ל־`users/{uid}` – שמירת אישור תקנון ב-Firestore  
3. מעבר ל־`/` – דף הבית בודק שיש `termsAcceptedAt` במסמך

אם שלב 2 נכשל – תראה הודעה (למשל permission-denied). אם הרשת תקועה – אחרי timeout תופיע הודעה במקום "מתחבר…" לנצח.

---

## F12 → Console

בזמן בעיה, פתח כלי מפתחים (F12) → לשונית **Console**:

- שגיאות אדומות מ־Firebase (קוד שגיאה) – חיפוש הקוד בגוגל או בהודעות בעברית באתר
- `[Yarhi Pro]` – הודעות מהאפליקציה

---

## סיכום מהיר

| תסמין | פעולה |
|--------|--------|
| "מתחבר…" נצחי | רשת / Firestore; בדוק Rules; נסה רשת אחרת; timeout יציג הודעה |
| שגיאה על Rules | פרסם `firestore.rules` |
| משתמש לא נמצא | בדוק אימייל/סיסמה; פרויקט נכון ב־`.env` |
| דף הבית "טוען…" | בדרך כלל Firestore לא מחזיר את מסמך המשתמש – Rules / רשת |
