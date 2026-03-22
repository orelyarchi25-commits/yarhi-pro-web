"use client";

import {
  getFirebaseProjectIdForUi,
  isFirebaseConfigured,
  isFirebaseConfigFromEnv,
} from "@/lib/firebase";

/** מציג האם Firebase מוגדר ואיזה projectId (בלי לחשוף מפתחות מלאים) */
export function FirebaseConnectionHint() {
  const ok = isFirebaseConfigured();
  const projectId = getFirebaseProjectIdForUi();
  const fromEnv = isFirebaseConfigFromEnv();

  if (!ok) {
    return (
      <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-sm text-red-950 text-right leading-relaxed" dir="rtl">
        <p className="font-black text-base mb-1">אין חיבור לענן Firebase</p>
        <p className="mb-2">
          בלי קובץ <code className="bg-red-100 px-1 rounded">.env.local</code> עם כל הערכים מ־Firebase Console, האתר לא יתחבר לחשבונות אמיתיים.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>העתק <code className="bg-red-100 px-1 rounded">.env.local.example</code> לשם <code className="bg-red-100 px-1 rounded">.env.local</code></li>
          <li>Console → ⚙️ Project settings → Your apps → בחר Web → Config</li>
          <li>הדבק לכל שורה <code className="bg-red-100 px-1 rounded">NEXT_PUBLIC_*</code> המתאימה</li>
          <li>עצור והרץ מחדש <code className="bg-red-100 px-1 rounded">npm run dev</code> או <code className="bg-red-100 px-1 rounded">npm start</code></li>
        </ol>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 text-xs text-emerald-950 text-right" dir="rtl">
      <span className="font-bold text-emerald-800">חיבור לענן:</span>{" "}
      <span className="font-mono font-bold">{projectId}</span>
      {!fromEnv && (
        <span className="mr-2 text-amber-800 font-bold">
          (הגדרה מוטמעת בקוד – מומלץ להעביר ל־.env.local)
        </span>
      )}
      <p className="mt-1 text-[11px] text-emerald-800/90">
        אם עדיין לא נכנס: בדוק ש־Firestore Rules פורסמו, וש־Email/Password מופעל ב־Authentication. אם יש{" "}
        <code className="bg-emerald-100/80 px-0.5 rounded">.env.local</code> – וודא שהערכים זהים לפרויקט בקונסול
        (אחרת ההתחברות תלך לפרויקט אחר).
      </p>
    </div>
  );
}
