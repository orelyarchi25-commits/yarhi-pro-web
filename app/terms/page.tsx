"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
        <h1 className="text-3xl font-black text-slate-800 mb-2">תקנון שימוש מחייב – Yarhi Pro</h1>
        <p className="text-slate-500 text-sm mb-8">
          מערכת Yarhi Pro הינה מערכת מקצועית לקבלני אלומיניום. עצם ההרשמה והשימוש במערכת מהווים הסכמה מלאה, בלתי חוזרת ומחייבת לכל תנאי תקנון זה.
        </p>

        <div className="prose prose-slate max-w-none text-slate-700 space-y-6">
          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">1. הגדרות והיקף</h2>
            <p>
              &quot;המערכת&quot;: כל ממשקי Yarhi Pro, לרבות חישובים, דוחות, תמחורים, מפרטי חיתוך, הדמיות דו־ממד/תלת־ממד וכל פלט נלווה. המערכת מיועדת לבעלי מקצוע בלבד, ומהווה כלי עזר
              תפעולי/ויזואלי בלבד.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">2. המערכת ככלי עזר בלבד</h2>
            <p>
              המערכת מסופקת במתכונת AS IS וללא כל התחייבות לתוצאה. אין במערכת, בתוצריה או בהמלצותיה כדי להוות ייעוץ הנדסי, משפטי, בטיחותי, מקצועי או כלכלי. על המשתמש לבצע בדיקה
              עצמאית, מלאה ומקצועית לכל מידה, חישוב, חתך, עומס, חומר, מחיר, זמינות ועמידה בתקנים.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">3. הגבלת אחריות ופטור מוחלט</h2>
            <p>
              מפתחי המערכת, הבעלים, המפעילים וכל גורם מטעמם לא יישאו באחריות לכל נזק, אובדן, הוצאה, תביעה, קנס, עיכוב, הפסד רווח, אובדן נתונים או נזק עקיף/ישיר/תוצאתי מכל סוג,
              לרבות עקב שגיאת חישוב, שגיאת חיתוך, שגיאת מפרט, שגיאת הדמיה, השמטת נתונים, כשל מערכת, השבתה, אבטחה או תקלה מכל מקור.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">4. אחריות משתמש ושיפוי</h2>
            <p>
              המשתמש נושא באחריות הבלעדית להזנת נתונים נכונה, אימות תוצרים, התאמתם לפרויקט, עמידה בדין, בתקנים ובהיתרים. המשתמש מתחייב לשפות ולפצות את בעלי המערכת בגין כל נזק, תביעה
              או הוצאה שתיגרם עקב שימושו במערכת או הפרת תקנון זה.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">5. ויתור טענות</h2>
            <p>
              המשתמש מוותר מראש, באופן מפורש ובלתי חוזר, על כל טענה ו/או דרישה ו/או תביעה כנגד בעלי המערכת ומפתחיה בקשר לשימוש במערכת או לתוצריה.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">6. עדכון תקנון וסמכות שיפוט</h2>
            <p>
              המפעיל רשאי לעדכן תקנון זה בכל עת. המשך שימוש לאחר עדכון מהווה הסכמה לגרסה המעודכנת. הדין החל וסמכות השיפוט הבלעדית יהיו לפי הדין הישראלי ובבתי המשפט המוסמכים בישראל בלבד.
            </p>
          </section>
        </div>

        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm leading-6">
          <strong>הצהרה חשובה:</strong> השימוש במערכת מותר רק למי שמאשר במפורש שכל החלטה תפעולית, מקצועית, הנדסית או מסחרית מתקבלת באחריותו הבלעדית.
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200">
          <Link href="/register" className="text-blue-600 font-bold hover:underline">← חזרה להרשמה</Link>
        </div>
      </div>
    </main>
  );
}
