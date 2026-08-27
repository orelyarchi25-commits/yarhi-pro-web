import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "components", "HouseFinApp.tsx");
let src = fs.readFileSync("C:/Users/USER/Downloads/housefin_premium.tsx", "utf8");

src = src.replace(
  "import React, { useState, useMemo, useEffect, useRef } from 'react';",
  `'use client';
// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from 'react';`
);

src = src.replace(
  "  ArrowLeftRight, LayoutTemplate, ChevronLeft, ChevronRight, Flame, Eye, EyeOff",
  "  ArrowLeftRight, LayoutTemplate, ChevronLeft, ChevronRight, Flame, Eye, EyeOff, LogOut"
);

src = src.replace(/new Date\('2026-08-15'\)/g, "new Date()");

src = src.replace(
  `export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyFromDate(new Date()));
  const [isPremium, setIsPremium] = useState(false);`,
  `export default function HouseFinApp({
  isPremium = false,
  userEmail = '',
  onUpgrade,
  onManageBilling,
  onSignOut,
  initialData,
  onPersist,
}) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyFromDate(new Date()));`
);

src = src.replace(
  "  const [expenseCategories, setExpenseCategories] = useState(DEFAULT_EXPENSE_CATEGORIES);\n  const [incomeCategories, setIncomeCategories] = useState(DEFAULT_INCOME_CATEGORIES);\n  const [budgets, setBudgets] = useState({ סופרמרקט: 1800, דלק: 500, בילוי: 600 });",
  `  const [expenseCategories, setExpenseCategories] = useState(initialData?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES);
  const [incomeCategories, setIncomeCategories] = useState(initialData?.incomeCategories || DEFAULT_INCOME_CATEGORIES);
  const [budgets, setBudgets] = useState(initialData?.budgets || {});`
);

src = src.replace(
  `  const [accounts, setAccounts] = useState([
    { id: 'acc-checking', name: 'עו"ש ראשי', type: 'checking', startingBalance: 5000, icon: '🏦' },
    { id: 'acc-cash', name: 'מזומן בארנק', type: 'cash', startingBalance: 300, icon: '💵' },
    { id: 'acc-credit', name: 'כרטיס אשראי', type: 'credit', startingBalance: 0, icon: '💳' },
  ]);`,
  `  const [accounts, setAccounts] = useState(() =>
    initialData?.accounts?.length
      ? initialData.accounts
      : [{ id: 'acc-checking', name: 'עו"ש ראשי', type: 'checking', startingBalance: 0, icon: '🏦' }]
  );`
);

src = src.replace(
  `  const [loans, setLoans] = useState([
    { id: 1, name: 'משכנתא', totalAmount: 800000, remainingAmount: 620000, monthlyPayment: 4200, icon: '🏠' },
    { id: 2, name: 'הלוואת רכב', totalAmount: 60000, remainingAmount: 21000, monthlyPayment: 1350, icon: '🚗' },
  ]);`,
  `  const [loans, setLoans] = useState(() => initialData?.loans || []);`
);

src = src.replace(
  `  const [goals, setGoals] = useState([
    { id: 1, title: 'חופשה משפחתית באילת', targetAmount: 8000, currentAmount: 3500, icon: '✈️', color: 'bg-blue-500' },
    { id: 2, title: 'קרן חירום', targetAmount: 20000, currentAmount: 12500, icon: '🛡️', color: 'bg-emerald-500' },
    { id: 3, title: 'סלון חדש', targetAmount: 5000, currentAmount: 1000, icon: '🛋️', color: 'bg-violet-500' },
  ]);`,
  `  const [goals, setGoals] = useState(() => initialData?.goals || []);`
);

src = src.replace(
  /  const \[transactions, setTransactions\] = useState\(\[[\s\S]*?\n  \]\);/,
  `  const [transactions, setTransactions] = useState(() => initialData?.transactions || []);`
);

src = src.replace(
  "  const [familyName, setFamilyName] = useState('משפחת ישראלי');",
  "  const [familyName, setFamilyName] = useState(initialData?.familyName || 'המשפחה שלי');"
);

src = src.replace(
  "  useEffect(() => {\n    document.documentElement.classList.toggle('dark', darkMode);\n  }, [darkMode]);",
  `  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (initialData?.darkMode) setDarkMode(true);
    if (initialData?.showTips === false) setShowTips(false);
  }, []);

  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (!onPersist) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onPersist({
        familyName,
        darkMode,
        showTips,
        expenseCategories,
        incomeCategories,
        budgets,
        accounts,
        loans,
        goals,
        transactions,
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [
    familyName, darkMode, showTips, expenseCategories, incomeCategories,
    budgets, accounts, loans, goals, transactions, onPersist,
  ]);`
);

src = src.replace(
  `              onClick={() => setDarkMode((v) => !v)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="מצב כהה"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>`,
  `              onClick={() => setDarkMode((v) => !v)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="מצב כהה"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="התנתקות"
                title={userEmail || 'התנתקות'}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}`
);

src = src.replace(
  `              <p className="text-sm text-slate-400 mb-4">הדגמה — תשלום אמיתי יתחבר בהמשך (Stripe / Supabase).</p>`,
  `              <p className="text-sm text-slate-400 mb-4">
                {userEmail ? <span className="block mb-1 text-slate-500">{userEmail}</span> : null}
                פרימיום נפתח רק אחרי תשלום מאובטח ב-Stripe. הביטול דרך פורטל החיוב.
              </p>`
);

src = src.replace(
  `                {isPremium ? (
                  <button onClick={() => setIsPremium(false)} className="text-xs text-slate-400 underline">
                    בטל פרימיום (הדגמה)
                  </button>
                ) : (
                  <button onClick={openUpgrade} className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-indigo-500">
                    שדרג
                  </button>
                )}`,
  `                {isPremium ? (
                  <button onClick={() => onManageBilling?.()} className="text-xs text-slate-400 underline">
                    ניהול חיוב
                  </button>
                ) : (
                  <button onClick={openUpgrade} className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-indigo-500">
                    שדרג
                  </button>
                )}`
);

src = src.replace(
  `            <button
              onClick={() => {
                setIsPremium(true);
                setShowUpgradeModal(false);
                showToast('ברוכים הבאים לפרימיום!', 'success');
              }}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500"
            >
              שדרג עכשיו
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">הדגמה בלבד — חיוב אמיתי בהמשך</p>`,
  `            <button
              onClick={async () => {
                setShowUpgradeModal(false);
                showToast('מעבירים לתשלום מאובטח...', 'info');
                await onUpgrade?.();
              }}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500"
            >
              המשך לתשלום מאובטח
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">Stripe · ניתן לבטל בכל עת</p>`
);

if (src.includes("setIsPremium") || src.includes("function App(") || src.includes("משפחת ישראלי")) {
  console.error("import-app: some replacements did not apply");
  if (src.includes("setIsPremium")) console.error(" - still has setIsPremium");
  if (src.includes("function App(")) console.error(" - still has function App");
  if (src.includes("משפחת ישראלי")) console.error(" - still has demo family");
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, src);
console.log("wrote", dest, src.length, "chars");
