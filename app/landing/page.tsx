"use client";

import Link from "next/link";
import "./landing.css";

export default function LandingPage() {
  return (
    <div className="yp-landing" dir="rtl">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            Yarhi <span>Pro</span>
          </div>
          <nav className="nav-links">
            <a className="hide-sm" href="#shots">
              מהרואה
            </a>
            <a className="hide-sm" href="#features">
              יכולות
            </a>
            <a className="hide-sm" href="#modules">
              מודולים
            </a>
            <a href="#pricing">מחיר</a>
            <Link href="/login" className="btn-ghost btn-sm">
              התחברות
            </Link>
            <Link href="/register" className="btn btn-sm">
              הרשמה
            </Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <span className="badge">לקבלני אלומיניום · פרגולות · גדרות · חלונות</span>
          <h1>
            מערכת אחת שמנהלת לך
            <br />
            את העסק מהצעה עד גבייה
          </h1>
          <p className="lead">
            חישוב מדויק, הדמיית 3D ללקוח, CRM, לו״ז התקנות ותיקונים, מידות שטח לחלונות וניהול כספים — הכל
            בעברית, בענן, במקום אחד.
          </p>
          <div className="hero-price">
            <strong>220 ₪ לחודש כולל מע״מ</strong>
            <span className="muted">או 2,200 ₪ לשנה כולל מע״מ (חודשיים מתנה)</span>
          </div>
          <div className="hero-actions">
            <Link href="/register" className="btn">
              הרשמה למערכת
            </Link>
            <Link href="/login" className="btn btn-outline">
              התחברות
            </Link>
            <a href="#shots" className="btn btn-outline">
              צילומים מהתוכנה
            </a>
          </div>
        </div>
      </section>

      <section id="shots">
        <div className="container text-center">
          <h2>ככה זה נראה מבפנים</h2>
          <p className="lead">צילומי מסך אמיתיים מתוך Yarhi Pro — הדמיה, שרטוט, חיתוכים והזמנת חומר.</p>
          <div className="shots-grid">
            <figure className="shot hero-shot">
              <img src="/landing/sim-glass.png" alt="הדמיית 3D של סגירת אלומיניום וזכוכית" />
              <figcaption>
                <strong>הדמיית 3D ללקוח</strong>
                <span>מציגים את התוצאה לפני סגירת עסקה — נראה מקצועי וברור.</span>
              </figcaption>
            </figure>
            <figure className="shot wide">
              <img src="/landing/sim-pergola.png" alt="הדמיית פרגולה תלת־ממד" loading="lazy" />
              <figcaption>
                <strong>הדמיית פרגולה</strong>
                <span>סביבה, צללים והקלטה לשיתוף מהיר עם הלקוח.</span>
              </figcaption>
            </figure>
            <figure className="shot wide">
              <img src="/landing/sim-fence.png" alt="הדמיית גדר ושער" loading="lazy" />
              <figcaption>
                <strong>הדמיית גדר ושער</strong>
                <span>מקטעים, מילוי ושער כניסה — מוכן להצגה בחצר.</span>
              </figcaption>
            </figure>
            <figure className="shot">
              <img src="/landing/sketch.png" alt="שרטוט שדות ומידות חיתוך" loading="lazy" />
              <figcaption>
                <strong>שרטוט שדות ומידות</strong>
                <span>שבלונה, חיתוך וכמויות לכל שדה — בלי טעויות ידניות.</span>
              </figcaption>
            </figure>
            <figure className="shot">
              <img src="/landing/cutting.png" alt="רשימת חיתוכים" loading="lazy" />
              <figcaption>
                <strong>רשימת חיתוכים</strong>
                <span>פרופיל, ייעוד, כמות ומידה — מוכן לייצור במפעל.</span>
              </figcaption>
            </figure>
            <figure className="shot">
              <img src="/landing/bom.png" alt="הזמנת חומר ופירזול" loading="lazy" />
              <figcaption>
                <strong>הזמנת חומר ופירזול</strong>
                <span>מוטות שלמים, RAL, ברגים ותוספות — הזמנה למחסן בלחיצה.</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section>
        <div className="container text-center">
          <h2>מכירים את זה?</h2>
          <p className="lead">חישובים ביד, לקוח שלא רואה את התוצאה, לו״ז מבולגן, וחובות שנשכחים.</p>
          <div className="pain-grid">
            <div className="pain-card">
              <h3>טעויות במידות וכמויות</h3>
              <p>חישוב ידני גוזל זמן ומסכן הזמנת חומר וחיתוך במפעל.</p>
            </div>
            <div className="pain-card">
              <h3>לקוח מתלבט</h3>
              <p>בלי הדמיה ברורה קשה לסגור עסקה ולשדר מקצועיות.</p>
            </div>
            <div className="pain-card">
              <h3>לו״ז והתקנות</h3>
              <p>פרויקטים, תיקונים ועבודות שטח מתפזרים בוואטסאפ ובמחברת.</p>
            </div>
            <div className="pain-card">
              <h3>גבייה וחובות</h3>
              <p>מקדמות, אמצע וגמר חשבון — בלי תמונה ברורה של מי חייב.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="modules">
        <div className="container text-center">
          <h2>כל המודולים כלולים במנוי</h2>
          <p className="lead">אין חבילות מפורקות — מקבלים את המערכת המלאה.</p>
          <div className="modules-grid">
            <div className="module-card">
              <span className="kicker">חישובים</span>
              <h3>פרגולות וגדרות</h3>
              <ul>
                <li>פרגולות: מסגרת, הצללה, סנטף, LED, עמודים</li>
                <li>גדרות: מקטעים, פינות, מילויים וזיגזג</li>
                <li>תמחור אוטומטי לפני/כולל מע״מ</li>
                <li>פרויקט משולב ללקוח אחד</li>
              </ul>
            </div>
            <div className="module-card">
              <span className="kicker">ויזואלי</span>
              <h3>הדמיות 3D</h3>
              <ul>
                <li>הדמיית פרגולה והדמיית גדר</li>
                <li>שער כניסה בהדמיה (כנף / דו־כנפי)</li>
                <li>שליחת הדמיה ללקוח בוואטסאפ</li>
                <li>קישור צפייה לשיתוף מהיר</li>
              </ul>
            </div>
            <div className="module-card">
              <span className="kicker">מכירות</span>
              <h3>הצעות מחיר ו־PDF</h3>
              <ul>
                <li>הצעת מחיר עם לוגו ותנאים</li>
                <li>דוח ייצור וחיתוכים למפעל</li>
                <li>הדפסה / PDF ושליחה בוואטסאפ</li>
                <li>עריכת מחיר והנחות מול מחירון</li>
              </ul>
            </div>
            <div className="module-card">
              <span className="kicker">לקוחות</span>
              <h3>CRM ולוח בקרה</h3>
              <ul>
                <li>לידים וסטטוסים עד התקנה</li>
                <li>חיפוש לפי שם / טלפון</li>
                <li>התראות על הצעות שלא טופלו</li>
                <li>שמירת פרויקט מתוך החישובים</li>
              </ul>
            </div>
            <div className="module-card">
              <span className="kicker">שטח</span>
              <h3>ניהול לו״ז</h3>
              <ul>
                <li>לו״ז לפרויקטים: ייצור + חלון התקנה</li>
                <li>לו״ז לתיקונים ועבודות שטח</li>
                <li>סטטוסים: ממתין / בייצור / הושלם</li>
                <li>תצוגת לוח לפי תאריכי התקנה</li>
              </ul>
            </div>
            <div className="module-card">
              <span className="kicker">מדידה</span>
              <h3>מידות חלונות (שדה)</h3>
              <ul>
                <li>מדידה, פרופיל, זכוכית ומסילות</li>
                <li>תריס, רשת, מקלחון ועוד</li>
                <li>שמירה, PDF וקישור ל־CRM</li>
                <li>הערות פריט וחפיפות</li>
              </ul>
            </div>
            <div className="module-card">
              <span className="kicker">כסף</span>
              <h3>ניהול פיננסי וגבייה</h3>
              <ul>
                <li>הכנסות, הוצאות ומקדמות</li>
                <li>רשימת חייבים ויתרות</li>
                <li>מע״מ, רווח חודשי ודוחות</li>
                <li>ייצוא Excel והדפסת דוח</li>
              </ul>
            </div>
            <div className="module-card">
              <span className="kicker">ענן</span>
              <h3>סנכרון והגדרות עסק</h3>
              <ul>
                <li>שמירה בענן בין מכשירים</li>
                <li>לוגו עסק להצעות ולדוחות</li>
                <li>מחירונים ותנאי הצעה</li>
                <li>ממשק מובייל נוח לשטח</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="features">
        <div className="container text-center">
          <h2>פירוט מלא — מה המערכת יודעת לעשות</h2>
          <p className="lead">רשימה מלאה ליכולות שכבר עובדות ב־Yarhi Pro.</p>
          <div className="all-grid">
            <div className="feature-card">
              <h3>פרגולות</h3>
              <ul>
                <li>מידות, מסגרת דאבל טי / הייטק / חלק</li>
                <li>הצללה 20/40, 20/70, משולב, סנטף</li>
                <li>קירוי סנטף, עמודים לפי צדדים</li>
                <li>LED והכנה למאווררי תקרה</li>
                <li>סגירה / ויטרינות כתוספת להצעה</li>
              </ul>
            </div>
            <div className="feature-card">
              <h3>גדרות</h3>
              <ul>
                <li>מקטעים עם פינה 90° או המשך</li>
                <li>מילוי 100/70/40/20 ומיקסים</li>
                <li>זיגזג אטום 120/20</li>
                <li>הדמיה עם שער ופתיחה</li>
                <li>חיתוכים, משקלים ורשימת חומר</li>
              </ul>
            </div>
            <div className="feature-card">
              <h3>הצעה ללקוח + ייצור</h3>
              <ul>
                <li>הצעת מחיר מקצועית בעברית</li>
                <li>תנאי אספקה, אחריות ותשלומים</li>
                <li>דוח ייצור למפעל (פרגולה/גדר)</li>
                <li>הזמנת קיט בוואטסאפ אחרי שליחה לייצור</li>
                <li>סיכום מאוחד לפרויקט משולב</li>
              </ul>
            </div>
            <div className="feature-card">
              <h3>CRM</h3>
              <ul>
                <li>לוח בקרה ופרויקטים אחרונים</li>
                <li>ליד חדש ומעקב סטטוסים</li>
                <li>נשלחה הצעה → אושר → בעבודה → הותקן</li>
                <li>התראות מעקב מעל 48 שעות</li>
                <li>קישור מחישובי שטח וחלונות</li>
              </ul>
            </div>
            <div className="feature-card">
              <h3>לו״ז פרויקטים ותיקונים</h3>
              <ul>
                <li>ימי ייצור + חלון התקנה לפרויקט</li>
                <li>תיקון / עבודת שטח עם תאריך ושעות</li>
                <li>סטטוס מתוזמן / בביצוע / הושלם</li>
                <li>תצוגת לוח לפי תאריכים</li>
                <li>שעות אופציונליות לעבודות שטח</li>
              </ul>
            </div>
            <div className="feature-card">
              <h3>מידות חלונות בשטח</h3>
              <ul>
                <li>רישום מידות לכל פתח</li>
                <li>פרופיל, זכוכית, מסילות, מנעול</li>
                <li>תריס שלבים / גלילה / רשת</li>
                <li>חפיפה והערות לפריט</li>
                <li>שמירה, PDF וקישור ללקוח ב־CRM</li>
              </ul>
            </div>
            <div className="feature-card">
              <h3>כספים ודוחות</h3>
              <ul>
                <li>מקדמה / אמצע / גמר חשבון</li>
                <li>חייבים ויתרות לגבייה</li>
                <li>הכנסות, הוצאות ורווח חודשי</li>
                <li>מע״מ ופרויקטים חיצוניים</li>
                <li>ייצוא דוחות ותנאי תשלום</li>
              </ul>
            </div>
            <div className="feature-card">
              <h3>עבודה יומיומית</h3>
              <ul>
                <li>סנכרון בענן בין מחשב לנייד</li>
                <li>לוגו עסק מסונכרן להצעות</li>
                <li>הגדרות מע״מ ומחירונים</li>
                <li>התחברות מאובטחת ואיפוס סיסמה</li>
                <li>ממשק בעברית מלאה</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="container">
          <h2 className="text-center">מחיר פשוט — הכל כלול</h2>
          <p className="lead">בלי חבילות מסובכות. מנוי אחד לכל היכולות. המחירים כוללים מע״מ.</p>
          <div className="pricing-grid">
            <div className="price-card">
              <h3>מנוי חודשי</h3>
              <p className="muted" style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                גמיש, אפשר להפסיק בכל חודש
              </p>
              <div className="amount">220 ₪</div>
              <div className="period">לחודש</div>
              <div className="vat-note">כולל מע״מ</div>
              <ul className="features">
                <li>כל המודולים ללא הגבלה</li>
                <li>הדמיות, חישובים, CRM ולו״ז</li>
                <li>מידות חלונות + פיננסי</li>
                <li>שמירה בענן</li>
              </ul>
              <Link href="/register" className="btn btn-outline">
                הרשמה — מנוי חודשי
              </Link>
            </div>
            <div className="price-card featured">
              <span className="tag">הכי משתלם</span>
              <h3>מנוי שנתי</h3>
              <p className="muted" style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                משלמים על 10 חודשים · מקבלים 12
              </p>
              <div className="amount">2,200 ₪</div>
              <div className="period">לשנה</div>
              <div className="vat-note">כולל מע״מ · חיסכון של חודשיים</div>
              <ul className="features">
                <li>הכל כמו במנוי החודשי</li>
                <li>2 חודשים מתנה</li>
                <li>עדיפות לתמיכה והטמעה</li>
                <li>מחיר קבוע לכל השנה</li>
              </ul>
              <Link href="/register" className="btn">
                הרשמה — מנוי שנתי
              </Link>
            </div>
          </div>
          <p className="save-banner">שנתי = 183 ₪ לחודש בממוצע (כולל מע״מ) במקום 220 ₪</p>
        </div>
      </section>

      <section>
        <div className="container">
          <h2 className="text-center">שאלות נפוצות</h2>
          <div className="faq-list">
            <div className="faq-item">
              <strong>מה כלול במחיר?</strong>
              <p>
                המערכת המלאה: פרגולות, גדרות, הדמיות 3D, הצעות ו־PDF, CRM, לו״ז פרויקטים ותיקונים, מידות
                חלונות, ניהול פיננסי ושמירה בענן.
              </p>
            </div>
            <div className="faq-item">
              <strong>המחיר כולל מע״מ?</strong>
              <p>כן. 220 ₪ לחודש או 2,200 ₪ לשנה — כולל מע״מ.</p>
            </div>
            <div className="faq-item">
              <strong>יש התחייבות?</strong>
              <p>
                במנוי חודשי אין התחייבות ארוכה. במנוי שנתי משלמים מראש לשנה ומקבלים חודשיים מתנה.
              </p>
            </div>
            <div className="faq-item">
              <strong>האם הנתונים נשמרים בענן?</strong>
              <p>כן. העבודה מסונכרנת ונגישה מהמחשב ומהנייד, עם גישה רק למשתמש המנוי.</p>
            </div>
            <div className="faq-item">
              <strong>המערכת בעברית?</strong>
              <p>כן. ממשק, הצעות, דוחות ייצור ומידות שטח — הכל בעברית.</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="cta-box">
            <h2>מוכן לסדר את העסק במקום אחד?</h2>
            <p className="sub">הירשם למערכת או התחבר אם כבר יש לך חשבון.</p>
            <div className="cta-actions">
              <Link href="/register" className="btn">
                הרשמה למערכת
              </Link>
              <Link href="/login" className="btn btn-outline">
                התחברות
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="yp-foot">
        <div className="container">
          <p>
            <strong>Yarhi Pro</strong> — חישוב, הדמיה וניהול לקבלני אלומיניום, פרגולות, גדרות וחלונות.
          </p>
          <p style={{ marginTop: "0.4rem" }}>
            220 ₪ / חודש כולל מע״מ · 2,200 ₪ / שנה כולל מע״מ · © כל הזכויות שמורות
          </p>
        </div>
      </footer>
    </div>
  );
}
