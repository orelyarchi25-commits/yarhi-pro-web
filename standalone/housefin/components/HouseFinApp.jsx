'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Home, PlusCircle, List, Upload, TrendingUp, TrendingDown, Wallet, Trash2, Download,
  AlertCircle, CheckCircle2, Calendar, Target, Trophy, Plus, Settings as SettingsIcon,
  Search, Pencil, X, Repeat, PiggyBank, Lock, Sparkles, FileText, Printer, Bell,
  ArrowRight, ArrowLeft, Building2, Banknote, Landmark, Moon, Sun, Undo2, Zap,
  ArrowLeftRight, LayoutTemplate, ChevronLeft, ChevronRight, Flame, Eye, EyeOff, LogOut
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from 'recharts';

const DEFAULT_EXPENSE_CATEGORIES = [
  'סופרמרקט', 'דלק', 'בגדים', 'בילוי', 'בתי מלון', 'ועד בית',
  'חשמל', 'ארנונה', 'אינטרנט', 'טלפון', 'אחר'
];
const DEFAULT_INCOME_CATEGORIES = ['משכורת', 'עסק', 'השקעות', 'קצבה', 'מתנה', 'אחר'];
const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#3B82F6', '#F97316', '#6B7280'];
const HE_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const ACCOUNT_TYPES = { checking: 'עו"ש', cash: 'מזומן', credit: 'אשראי' };
const PREMIUM_PRICE = '24.90';

const QUICK_TEMPLATES = [
  { label: 'סופר', type: 'expense', category: 'סופרמרקט', amount: '', icon: '🛒' },
  { label: 'דלק', type: 'expense', category: 'דלק', amount: '', icon: '⛽' },
  { label: 'משכורת', type: 'income', category: 'משכורת', amount: '12000', icon: '💰' },
  { label: 'חשמל', type: 'expense', category: 'חשמל', amount: '', icon: '💡', recurring: true },
];

function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyFromDate(d);
}
function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}
function formatMonthLabel(key) {
  const [y, m] = key.split('-');
  return `${HE_MONTHS[Number(m) - 1]} ${y}`;
}

// Helper: Ensure "אחר" is always at the end of the array
function getOrderedCategories(categories) {
  const others = categories.filter(c => c === 'אחר');
  const rest = categories.filter(c => c !== 'אחר');
  return [...rest, ...others];
}

function PremiumLock({ title, description, onUpgrade }) {
  return (
    <div className="hf-card rounded-2xl border border-slate-100 dark:border-slate-800 p-8 text-center bg-white dark:bg-slate-900 shadow-sm">
      <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Lock className="w-7 h-7 text-indigo-500" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs mx-auto">{description}</p>
      <button
        onClick={onUpgrade}
        className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-md hover:bg-indigo-500 transition-colors"
      >
        <Sparkles className="w-4 h-4" /> שדרג לפרימיום
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="text-sm text-slate-400 mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}

export default function HouseFinApp({
  isPremium = false,
  userEmail = '',
  onUpgrade,
  onManageBilling,
  onSignOut,
  initialData,
  onPersist,
}) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyFromDate(new Date()));
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [darkMode, setDarkMode] = useState(!!initialData?.darkMode);
  const [showTips, setShowTips] = useState(initialData?.showTips !== false);
  const [toast, setToast] = useState(null);
  const [deletedTx, setDeletedTx] = useState(null);
  const undoTimer = useRef(null);

  const [expenseCategories, setExpenseCategories] = useState(initialData?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES);
  const [incomeCategories, setIncomeCategories] = useState(initialData?.incomeCategories || DEFAULT_INCOME_CATEGORIES);
  const [budgets, setBudgets] = useState(initialData?.budgets || {});

  const [accounts, setAccounts] = useState(() =>
    initialData?.accounts?.length
      ? initialData.accounts
      : [{ id: 'acc-checking', name: 'עו"ש ראשי', type: 'checking', startingBalance: 0, icon: '🏦' }]
  );
  const [showNewAccountForm, setShowNewAccountForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('checking');
  const [newAccountBalance, setNewAccountBalance] = useState('');

  const [loans, setLoans] = useState(() => initialData?.loans || []);
  const [showNewLoanForm, setShowNewLoanForm] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [newLoanName, setNewLoanName] = useState('');
  const [newLoanTotal, setNewLoanTotal] = useState('');
  const [newLoanRemaining, setNewLoanRemaining] = useState('');
  const [newLoanPayment, setNewLoanPayment] = useState('');
  const [loanPaymentInputs, setLoanPaymentInputs] = useState({});
  const [expandedLoanId, setExpandedLoanId] = useState(null);

  const [goals, setGoals] = useState(() => initialData?.goals || []);
  const [showNewGoalForm, setShowNewGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalCurrent, setNewGoalCurrent] = useState('');
  const [newGoalIcon, setNewGoalIcon] = useState('🎯');
  const [contribInputs, setContribInputs] = useState({});

  const [transactions, setTransactions] = useState(() => initialData?.transactions || []);

  const [editingId, setEditingId] = useState(null);
  const [formType, setFormType] = useState('expense');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formRecurring, setFormRecurring] = useState(false);
  const [formOtherText, setFormOtherText] = useState('');
  const [formAccountId, setFormAccountId] = useState('acc-checking');
  const [formToAccountId, setFormToAccountId] = useState('acc-cash');
  const [formError, setFormError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const [historySearch, setHistorySearch] = useState('');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all');
  const [historyAllMonths, setHistoryAllMonths] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense');
  const [familyName, setFamilyName] = useState(initialData?.familyName || 'המשפחה שלי');

  useEffect(() => {
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
  ]);

  useEffect(() => {
    if (formType === 'transfer') return;
    const list = formType === 'expense' ? expenseCategories : incomeCategories;
    if (!list.includes(formCategory)) setFormCategory(list[0] || '');
  }, [formType, expenseCategories, incomeCategories, formCategory]);

  useEffect(() => {
    if (!formAmount || !formDate || formType === 'transfer') {
      setDuplicateWarning(false);
      return;
    }
    const amountNum = Number(formAmount);
    const hit = transactions.some(
      (t) =>
        t.id !== editingId &&
        t.type === formType &&
        Number(t.amount) === amountNum &&
        t.date === formDate &&
        (formCategory === 'אחר' ? true : t.category === formCategory)
    );
    setDuplicateWarning(hit);
  }, [formAmount, formDate, formType, formCategory, transactions, editingId]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3200);
  };

  const filteredTransactions = useMemo(
    () => transactions.filter((t) => t.type !== 'transfer' && t.date.startsWith(selectedMonth)),
    [transactions, selectedMonth]
  );

  const stats = useMemo(() => {
    let income = 0;
    let expenses = 0;
    filteredTransactions.forEach((t) => {
      if (t.type === 'income') income += Number(t.amount);
      if (t.type === 'expense') expenses += Number(t.amount);
    });
    const balance = income - expenses;
    const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
    return { income, expenses, balance, savingsRate };
  }, [filteredTransactions]);

  const prevMonthStats = useMemo(() => {
    const prev = shiftMonth(selectedMonth, -1);
    const monthTx = transactions.filter((t) => t.type !== 'transfer' && t.date.startsWith(prev));
    let income = 0;
    let expenses = 0;
    monthTx.forEach((t) => {
      if (t.type === 'income') income += Number(t.amount);
      if (t.type === 'expense') expenses += Number(t.amount);
    });
    return { key: prev, income, expenses, balance: income - expenses };
  }, [transactions, selectedMonth]);

  const expensesByCategory = useMemo(() => {
    const expenses = filteredTransactions.filter((t) => t.type === 'expense');
    const grouped = expenses.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + Number(curr.amount);
      return acc;
    }, {});
    return Object.keys(grouped)
      .map((key) => ({ name: key, value: grouped[key] }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const trendData = useMemo(() => {
    const months = [];
    const base = new Date(`${selectedMonth}-01T12:00:00`);
    for (let i = 5; i >= 0; i--) {
      months.push(monthKeyFromDate(new Date(base.getFullYear(), base.getMonth() - i, 1)));
    }
    return months.map((key) => {
      const [, m] = key.split('-');
      const monthTx = transactions.filter((t) => t.type !== 'transfer' && t.date.startsWith(key));
      const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
      const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
      return { month: HE_MONTHS[Number(m) - 1], key, הכנסות: income, הוצאות: expense, מאזן: income - expense };
    });
  }, [transactions, selectedMonth]);

  const budgetProgress = useMemo(
    () =>
      Object.entries(budgets)
        .filter(([, amount]) => Number(amount) > 0)
        .map(([category, amount]) => {
          const spent = expensesByCategory.find((c) => c.name === category)?.value || 0;
          const percent = Math.min(100, Math.round((spent / amount) * 100));
          return { category, amount: Number(amount), spent, percent, over: spent > amount };
        }),
    [budgets, expensesByCategory]
  );

  const historySource = useMemo(() => {
    const base = historyAllMonths
      ? transactions.filter((t) => t.type !== 'transfer')
      : filteredTransactions;
    return base.filter((t) => {
      const matchesCategory = historyCategoryFilter === 'all' || t.category === historyCategoryFilter;
      const search = historySearch.trim().toLowerCase();
      const matchesSearch =
        !search ||
        t.category.toLowerCase().includes(search) ||
        (t.notes || '').toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [filteredTransactions, transactions, historyAllMonths, historyCategoryFilter, historySearch]);

  const accountBalances = useMemo(
    () =>
      accounts.map((acc) => {
        const balance = transactions.reduce((sum, t) => {
          if (t.type === 'transfer') {
            if (t.accountId === acc.id) return sum - Number(t.amount);
            if (t.toAccountId === acc.id) return sum + Number(t.amount);
            return sum;
          }
          if (t.accountId !== acc.id) return sum;
          return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
        }, acc.startingBalance);
        return { ...acc, balance };
      }),
    [accounts, transactions]
  );

  const netWorth = useMemo(() => {
    const assets = accountBalances.filter((a) => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
    const creditDebt = accountBalances.filter((a) => a.type === 'credit').reduce((s, a) => s + Math.max(0, -a.balance), 0);
    const loansDebt = loans.reduce((s, l) => s + Number(l.remainingAmount), 0);
    const liabilities = creditDebt + loansDebt;
    return { assets, liabilities, net: assets - liabilities };
  }, [accountBalances, loans]);

  const netWorthHistory = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      months.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    return months.map((key) => {
      const end = new Date(`${key}-28T23:59:59`);
      const assets = accounts
        .filter((a) => a.type !== 'credit')
        .reduce((sum, acc) => {
          const bal = transactions.reduce((s, t) => {
            if (new Date(t.date) > end) return s;
            if (t.type === 'transfer') {
              if (t.accountId === acc.id) return s - Number(t.amount);
              if (t.toAccountId === acc.id) return s + Number(t.amount);
              return s;
            }
            if (t.accountId !== acc.id) return s;
            return s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
          }, acc.startingBalance);
          return sum + bal;
        }, 0);
      const [, m] = key.split('-');
      return { month: HE_MONTHS[Number(m) - 1], שווי: Math.round(assets) };
    });
  }, [accounts, transactions]);

  const recurringSummary = useMemo(() => {
    const map = {};
    transactions
      .filter((t) => t.recurring && t.type !== 'transfer')
      .forEach((t) => {
        const key = `${t.type}-${t.category}`;
        if (!map[key] || new Date(t.date) > new Date(map[key].date)) map[key] = t;
      });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const cashflowForecast = useMemo(() => {
    const recurringIncome = recurringSummary.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const recurringExpense = recurringSummary.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const loanPayments = loans.filter((l) => l.remainingAmount > 0).reduce((s, l) => s + Number(l.monthlyPayment), 0);
    const months = [1, 2, 3].map((i) => {
      const key = shiftMonth(selectedMonth, i);
      const projected = recurringIncome - recurringExpense - loanPayments;
      return {
        key,
        label: formatMonthLabel(key),
        income: recurringIncome,
        expense: recurringExpense + loanPayments,
        balance: projected,
      };
    });
    return { months, recurringIncome, recurringExpense, loanPayments };
  }, [recurringSummary, loans, selectedMonth]);

  const loggingStreak = useMemo(() => {
    const days = new Set(transactions.map((t) => t.date));
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 30; i++) {
      const key = d.toISOString().split('T')[0];
      if (days.has(key)) {
        streak += 1;
        d.setDate(d.getDate() - 1);
      } else if (i === 0) {
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return streak;
  }, [transactions]);

  const resetForm = () => {
    setEditingId(null);
    setFormType('expense');
    setFormAmount('');
    setFormCategory(expenseCategories[0] || '');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormRecurring(false);
    setFormOtherText('');
    setFormAccountId(accounts[0]?.id || '');
    setFormToAccountId(accounts[1]?.id || accounts[0]?.id || '');
    setFormError('');
    setDuplicateWarning(false);
  };

  const applyTemplate = (tpl) => {
    setEditingId(null);
    setFormType(tpl.type);
    setFormCategory(tpl.category);
    setFormAmount(tpl.amount || '');
    setFormRecurring(!!tpl.recurring);
    setFormOtherText('');
    setFormError('');
    setActiveTab('add');
  };

  const startEdit = (t) => {
    if (t.type === 'transfer') {
      setEditingId(t.id);
      setFormType('transfer');
      setFormAmount(String(t.amount));
      setFormDate(t.date);
      setFormNotes(t.notes || '');
      setFormAccountId(t.accountId);
      setFormToAccountId(t.toAccountId);
      setFormError('');
      setActiveTab('add');
      return;
    }
    const list = t.type === 'expense' ? expenseCategories : incomeCategories;
    const isCustom = !list.includes(t.category);
    setEditingId(t.id);
    setFormType(t.type);
    setFormAmount(String(t.amount));
    setFormCategory(isCustom ? 'אחר' : t.category);
    setFormOtherText(isCustom ? t.category : '');
    setFormDate(t.date);
    setFormNotes(t.notes || '');
    setFormRecurring(!!t.recurring);
    setFormAccountId(t.accountId || accounts[0]?.id || '');
    setFormError('');
    setActiveTab('add');
  };

  const handleAddTransaction = (e) => {
    e.preventDefault();
    const amountNum = Number(formAmount);
    if (!formAmount || amountNum <= 0) {
      setFormError('הסכום חייב להיות מספר גדול מאפס');
      return;
    }
    if (!formDate) {
      setFormError('יש למלא תאריך');
      return;
    }

    if (formType === 'transfer') {
      if (!formAccountId || !formToAccountId || formAccountId === formToAccountId) {
        setFormError('יש לבחור שני חשבונות שונים להעברה');
        return;
      }
      const payload = {
        type: 'transfer',
        amount: amountNum,
        category: 'העברה',
        date: formDate,
        notes: formNotes,
        recurring: false,
        accountId: formAccountId,
        toAccountId: formToAccountId,
      };
      if (editingId) {
        setTransactions((prev) =>
          prev
            .map((t) => (t.id === editingId ? { ...t, ...payload } : t))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
        );
        showToast('ההעברה עודכנה', 'success');
      } else {
        setTransactions((prev) =>
          [{ id: Date.now(), ...payload }, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date))
        );
        showToast('העברה נרשמה', 'success');
      }
      setSelectedMonth(formDate.substring(0, 7));
      resetForm();
      setActiveTab('history');
      return;
    }

    if (!formCategory) {
      setFormError('יש למלא קטגוריה');
      return;
    }
    if (formCategory === 'אחר' && !formOtherText.trim()) {
      setFormError('נא לפרט את הקטגוריה בשדה החופשי');
      return;
    }

    const effectiveCategory = formCategory === 'אחר' ? formOtherText.trim() : formCategory;
    const payload = {
      type: formType,
      amount: amountNum,
      category: effectiveCategory,
      date: formDate,
      notes: formNotes,
      recurring: formRecurring,
      accountId: formAccountId,
    };

    if (editingId) {
      setTransactions((prev) =>
        prev
          .map((t) => (t.id === editingId ? { ...t, ...payload } : t))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
      );
      showToast('התנועה עודכנה', 'success');
    } else {
      setTransactions((prev) =>
        [{ id: Date.now(), ...payload }, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date))
      );
      showToast(formType === 'expense' ? 'הוצאה נוספה' : 'הכנסה נוספה', 'success');
    }

    setSelectedMonth(formDate.substring(0, 7));
    resetForm();
    setActiveTab('dashboard');
  };

  const deleteTransaction = (id) => {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setDeletedTx(tx);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeletedTx(null), 5000);
    showToast('התנועה נמחקה — ניתן לבטל', 'warn');
  };

  const undoDelete = () => {
    if (!deletedTx) return;
    setTransactions((prev) => [deletedTx, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
    setDeletedTx(null);
    clearTimeout(undoTimer.current);
    showToast('המחיקה בוטלה', 'success');
  };

  const formatCurrency = (num) =>
    new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(
      Math.abs(num)
    );

  const deltaLabel = (current, previous) => {
    if (!previous && !current) return null;
    const diff = current - previous;
    const pct = previous ? Math.round((diff / Math.abs(previous)) * 100) : null;
    return { diff, pct, up: diff >= 0 };
  };

  const exportToCSV = () => {
    const rows = historyAllMonths
      ? transactions.filter((t) => t.type !== 'transfer')
      : filteredTransactions;
    const headers = ['סוג', 'תאריך', 'קטגוריה', 'סכום', 'הערות', 'קבועה'];
    const csvData = rows.map((t) => [
      t.type === 'income' ? 'הכנסה' : 'הוצאה',
      t.date,
      t.category,
      t.amount,
      t.notes || '',
      t.recurring ? 'כן' : 'לא',
    ]);
    const summaryRows = [
      ['', '', '', '', '', ''],
      ['סה"כ הכנסות:', '', '', stats.income, '', ''],
      ['סה"כ הוצאות:', '', '', stats.expenses, '', ''],
      [stats.balance >= 0 ? 'רווח חודשי:' : 'גירעון (מינוס) חודשי:', '', '', stats.balance, '', ''],
    ];
    const BOM = '\uFEFF';
    const csvContent =
      BOM +
      [headers, ...csvData, ...summaryRows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `HouseFin_${historyAllMonths ? 'all' : selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetAccountForm = () => {
    setEditingAccountId(null);
    setNewAccountName('');
    setNewAccountBalance('');
    setNewAccountType('checking');
    setShowNewAccountForm(false);
  };

  const resetLoanForm = () => {
    setEditingLoanId(null);
    setNewLoanName('');
    setNewLoanTotal('');
    setNewLoanRemaining('');
    setNewLoanPayment('');
    setShowNewLoanForm(false);
  };

  const resetGoalForm = () => {
    setEditingGoalId(null);
    setNewGoalTitle('');
    setNewGoalTarget('');
    setNewGoalCurrent('');
    setNewGoalIcon('🎯');
    setShowNewGoalForm(false);
  };

  const addGoal = (e) => {
    e.preventDefault();
    if (!newGoalTitle || !newGoalTarget || Number(newGoalTarget) <= 0) return;
    const targetAmount = Number(newGoalTarget);
    const currentAmount = Math.max(0, Math.min(targetAmount, Number(newGoalCurrent) || 0));
    if (editingGoalId) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === editingGoalId
            ? { ...g, title: newGoalTitle, targetAmount, currentAmount, icon: newGoalIcon || g.icon }
            : g
        )
      );
      showToast('היעד עודכן', 'success');
    } else {
      const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-pink-500'];
      setGoals((prev) => [
        ...prev,
        {
          id: Date.now(),
          title: newGoalTitle,
          targetAmount,
          currentAmount,
          icon: newGoalIcon || '🎯',
          color: colors[Math.floor(Math.random() * colors.length)],
        },
      ]);
      showToast('היעד נוסף', 'success');
    }
    resetGoalForm();
  };

  const startEditGoal = (goal) => {
    setEditingGoalId(goal.id);
    setNewGoalTitle(goal.title);
    setNewGoalTarget(String(goal.targetAmount));
    setNewGoalCurrent(String(goal.currentAmount ?? 0));
    setNewGoalIcon(goal.icon || '🎯');
    setShowNewGoalForm(true);
  };

  const deleteGoal = (id) => {
    if (!window.confirm('למחוק את היעד?')) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (editingGoalId === id) resetGoalForm();
    showToast('היעד נמחק', 'success');
  };

  const contributeToGoal = (goalId) => {
    const amount = Number(contribInputs[goalId]);
    if (!amount || amount <= 0) return;
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, currentAmount: Math.min(g.targetAmount, g.currentAmount + amount) } : g
      )
    );
    setContribInputs((prev) => ({ ...prev, [goalId]: '' }));
  };

  const addCategory = (e) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name || name === 'אחר') return; // חוסם אפשרות לטעות עם אחר
    if (newCategoryType === 'expense') {
      if (!expenseCategories.includes(name)) setExpenseCategories((prev) => [...prev, name]);
    } else if (!incomeCategories.includes(name)) setIncomeCategories((prev) => [...prev, name]);
    setNewCategoryName('');
  };

  const removeCategory = (name, type) => {
    if (name === 'אחר') return; // הגנה שלא ימחקו את אחר
    
    if (type === 'expense') {
      if (expenseCategories.length <= 1) return;
      setExpenseCategories((prev) => prev.filter((c) => c !== name));
      setBudgets((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } else {
      if (incomeCategories.length <= 1) return;
      setIncomeCategories((prev) => prev.filter((c) => c !== name));
    }
  };

  const updateBudget = (category, value) => setBudgets((prev) => ({ ...prev, [category]: value }));

  const addAccount = (e) => {
    e.preventDefault();
    if (!newAccountName.trim()) return;
    const icon = newAccountType === 'credit' ? '💳' : newAccountType === 'cash' ? '💵' : '🏦';
    if (editingAccountId) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === editingAccountId
            ? {
                ...a,
                name: newAccountName.trim(),
                type: newAccountType,
                startingBalance: Number(newAccountBalance) || 0,
                icon,
              }
            : a
        )
      );
      showToast('החשבון עודכן', 'success');
    } else {
      setAccounts((prev) => [
        ...prev,
        {
          id: `acc-${Date.now()}`,
          name: newAccountName.trim(),
          type: newAccountType,
          startingBalance: Number(newAccountBalance) || 0,
          icon,
        },
      ]);
      showToast('החשבון נוסף', 'success');
    }
    resetAccountForm();
  };

  const startEditAccount = (account) => {
    setEditingAccountId(account.id);
    setNewAccountName(account.name);
    setNewAccountType(account.type);
    setNewAccountBalance(String(account.startingBalance ?? 0));
    setShowNewAccountForm(true);
  };

  const deleteAccount = (id) => {
    if (accounts.length <= 1) {
      showToast('חייב להישאר חשבון אחד לפחות', 'warn');
      return;
    }
    if (!window.confirm('למחוק את החשבון? התנועות שלו יועברו לחשבון שנשאר.')) return;
    const remaining = accounts.filter((a) => a.id !== id);
    const fallbackId = remaining[0].id;
    setAccounts(remaining);
    setTransactions((prev) =>
      prev
        .map((t) => {
          if (t.type === 'transfer') {
            const from = t.accountId === id ? fallbackId : t.accountId;
            const to = t.toAccountId === id ? fallbackId : t.toAccountId;
            if (from === to) return null;
            return { ...t, accountId: from, toAccountId: to };
          }
          return t.accountId === id ? { ...t, accountId: fallbackId } : t;
        })
        .filter(Boolean)
    );
    if (formAccountId === id) setFormAccountId(fallbackId);
    if (formToAccountId === id) setFormToAccountId(remaining[1]?.id || fallbackId);
    if (editingAccountId === id) resetAccountForm();
    showToast('החשבון נמחק', 'success');
  };

  const addLoan = (e) => {
    e.preventDefault();
    if (!newLoanName.trim() || !newLoanTotal || Number(newLoanTotal) <= 0) return;
    const totalAmount = Number(newLoanTotal);
    const remainingAmount = newLoanRemaining ? Number(newLoanRemaining) : totalAmount;
    const monthlyPayment = Number(newLoanPayment) || 0;
    if (editingLoanId) {
      setLoans((prev) =>
        prev.map((l) =>
          l.id === editingLoanId
            ? { ...l, name: newLoanName.trim(), totalAmount, remainingAmount, monthlyPayment }
            : l
        )
      );
      showToast('ההלוואה עודכנה', 'success');
    } else {
      setLoans((prev) => [
        ...prev,
        {
          id: Date.now(),
          name: newLoanName.trim(),
          totalAmount,
          remainingAmount,
          monthlyPayment,
          icon: '💰',
        },
      ]);
      showToast('ההלוואה נוספה', 'success');
    }
    resetLoanForm();
  };

  const startEditLoan = (loan) => {
    setEditingLoanId(loan.id);
    setNewLoanName(loan.name);
    setNewLoanTotal(String(loan.totalAmount));
    setNewLoanRemaining(String(loan.remainingAmount));
    setNewLoanPayment(String(loan.monthlyPayment || 0));
    setShowNewLoanForm(true);
  };

  const deleteLoan = (id) => {
    if (!window.confirm('למחוק את ההלוואה?')) return;
    setLoans((prev) => prev.filter((l) => l.id !== id));
    if (editingLoanId === id) resetLoanForm();
    if (expandedLoanId === id) setExpandedLoanId(null);
    showToast('ההלוואה נמחקה', 'success');
  };

  const payLoan = (loanId) => {
    const amount = Number(loanPaymentInputs[loanId]);
    if (!amount || amount <= 0) return;
    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId ? { ...l, remainingAmount: Math.max(0, l.remainingAmount - amount) } : l
      )
    );
    setLoanPaymentInputs((prev) => ({ ...prev, [loanId]: '' }));
  };

  const loanSchedule = (loan) => {
    if (!loan.monthlyPayment || loan.monthlyPayment <= 0) return [];
    const rows = [];
    let remaining = loan.remainingAmount;
    let i = 0;
    while (remaining > 0 && i < 6) {
      const pay = Math.min(loan.monthlyPayment, remaining);
      remaining -= pay;
      rows.push({ n: i + 1, pay, remaining });
      i += 1;
    }
    return rows;
  };

  const openUpgrade = () => setShowUpgradeModal(true);

  const expenseDelta = deltaLabel(stats.expenses, prevMonthStats.expenses);
  const incomeDelta = deltaLabel(stats.income, prevMonthStats.income);

  // ---------- REPORT VIEW ----------
  if (activeTab === 'report') {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-100 dark:bg-slate-950 font-hebrew">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap');
          .font-hebrew { font-family: 'Heebo', system-ui, -apple-system, sans-serif; }
          .hf-card { background-color: white; }
          .dark .hf-card { background-color: #0f172a; }
        `}</style>
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex justify-between items-center mb-4 no-print">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 text-sm font-medium"
            >
              <ArrowRight className="w-4 h-4" /> חזרה
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500"
            >
              <Printer className="w-4 h-4" /> הדפס / שמור כ-PDF
            </button>
          </div>

          <div className="hf-card bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-8">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Wallet className="w-6 h-6 text-indigo-600" /> HouseFin
                </h1>
                <p className="text-sm text-slate-500">דוח חודשי — {familyName}</p>
              </div>
              <div className="text-left text-sm text-slate-500">
                <p className="font-semibold text-slate-700 dark:text-slate-200">{formatMonthLabel(selectedMonth)}</p>
                <p>הופק ב-{new Date().toLocaleDateString('he-IL')}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3 text-center">
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">הכנסות</p>
                <p className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(stats.income)}</p>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl p-3 text-center">
                <p className="text-xs text-rose-700 dark:text-rose-400 mb-1">הוצאות</p>
                <p className="font-bold text-rose-700 dark:text-rose-400">{formatCurrency(stats.expenses)}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${stats.balance >= 0 ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'bg-amber-50 dark:bg-amber-950/40'}`}>
                <p className={`text-xs mb-1 ${stats.balance >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-amber-700'}`}>
                  {stats.balance >= 0 ? 'רווח' : 'גירעון'}
                </p>
                <p className={`font-bold ${stats.balance >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-amber-700'}`}>
                  {formatCurrency(stats.balance)}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              שיעור חיסכון: <span className="font-bold text-slate-800 dark:text-slate-100">{stats.savingsRate}%</span>
            </p>

            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">פירוט הוצאות לפי קטגוריה</h3>
            <table className="w-full text-sm mb-6">
              <tbody>
                {expensesByCategory.map((c) => (
                  <tr key={c.name} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="py-1.5 text-slate-600 dark:text-slate-300">{c.name}</td>
                    <td className="py-1.5 text-left font-medium">{formatCurrency(c.value)}</td>
                  </tr>
                ))}
                {expensesByCategory.length === 0 && (
                  <tr>
                    <td className="py-2 text-slate-400">אין נתוני הוצאות לחודש זה</td>
                  </tr>
                )}
              </tbody>
            </table>

            {isPremium && (
              <>
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">שווי נטו</h3>
                <div className="grid grid-cols-3 gap-3 mb-6 text-center text-sm">
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">נכסים</p>
                    <p className="font-bold">{formatCurrency(netWorth.assets)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">התחייבויות</p>
                    <p className="font-bold">{formatCurrency(netWorth.liabilities)}</p>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-3">
                    <p className="text-xs text-indigo-600 mb-1">שווי נטו</p>
                    <p className="font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(netWorth.net)}</p>
                  </div>
                </div>
              </>
            )}

            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">התקדמות ביעדים</h3>
            <div className="space-y-2">
              {goals.map((g) => {
                const percent = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
                return (
                  <div key={g.id} className="flex items-center gap-3 text-sm">
                    <span className="w-28 text-slate-600 dark:text-slate-300 truncate">
                      {g.icon} {g.title}
                    </span>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="text-slate-500 w-10 text-left">{percent}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-hebrew pb-28">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap');
        .font-hebrew { font-family: 'Heebo', system-ui, -apple-system, sans-serif; }
        .hf-card { background-color: white; }
        .dark .hf-card { background-color: #0f172a; }
        .animate-hf-in { animation: fadeIn 0.3s ease-out; }
        .animate-hf-toast { animation: slideUp 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        :root { --hf-header: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%); }
        .dark { --hf-header: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); }
      `}</style>

      <header className="sticky top-0 z-20 text-white shadow-lg" style={{ background: 'var(--hf-header)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold tracking-tight leading-none">HouseFin</h1>
              <p className="text-[11px] text-indigo-100/90 truncate mt-0.5">{familyName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loggingStreak > 0 && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] bg-white/10 px-2.5 py-1 rounded-full">
                <Flame className="w-3.5 h-3.5 text-amber-300" />
                {loggingStreak} ימים
              </div>
            )}
            {isPremium && (
              <div className="text-[11px] bg-amber-300 text-amber-950 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> פרימיום
              </div>
            )}
            <button
              onClick={() => setDarkMode((v) => !v)}
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
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-2 space-y-4">
        {showTips && activeTab === 'dashboard' && (
          <div className="animate-hf-in relative overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-700 text-white p-4 shadow-md">
            <button
              onClick={() => setShowTips(false)}
              className="absolute top-3 left-3 p-1 rounded-lg hover:bg-white/10"
              aria-label="סגור"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3 pr-1">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm">טיפ מהיר</p>
                <p className="text-sm text-emerald-50 mt-0.5 leading-relaxed">
                  השתמשו בתבניות מהירות ובמעבר חודשים למעלה כדי לעדכן תנועות בפחות מ־10 שניות.
                </p>
              </div>
            </div>
          </div>
        )}

        {(activeTab === 'dashboard' || activeTab === 'history') && (
          <div className="hf-card p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex justify-between items-center gap-3 animate-hf-in">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Calendar className="w-5 h-5 text-indigo-500" />
              <span className="font-semibold text-sm hidden sm:inline">חודש:</span>
              <span className="font-bold text-sm sm:text-base">{formatMonthLabel(selectedMonth)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelectedMonth((m) => shiftMonth(m, -1))}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                aria-label="חודש קודם"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none font-hebrew"
              />
              <button
                onClick={() => setSelectedMonth((m) => shiftMonth(m, 1))}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                aria-label="חודש הבא"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5 animate-hf-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="hf-card p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center">
                <p className="text-slate-500 text-sm mb-1">הכנסות</p>
                <p className="text-2xl font-bold text-emerald-600 flex items-center gap-1">
                  <TrendingUp className="w-5 h-5" />
                  {formatCurrency(stats.income)}
                </p>
                {incomeDelta && (
                  <p className={`text-[11px] mt-1.5 font-medium ${incomeDelta.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {incomeDelta.up ? '▲' : '▼'} {formatCurrency(incomeDelta.diff)} מול {formatMonthLabel(prevMonthStats.key)}
                  </p>
                )}
              </div>
              <div className="hf-card p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center">
                <p className="text-slate-500 text-sm mb-1">הוצאות</p>
                <p className="text-2xl font-bold text-rose-600 flex items-center gap-1">
                  <TrendingDown className="w-5 h-5" />
                  {formatCurrency(stats.expenses)}
                </p>
                {expenseDelta && (
                  <p className={`text-[11px] mt-1.5 font-medium ${!expenseDelta.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {expenseDelta.up ? '▲' : '▼'} {formatCurrency(expenseDelta.diff)} מול חודש קודם
                  </p>
                )}
              </div>
              <div
                className={`p-5 rounded-2xl border flex flex-col items-center ${
                  stats.balance >= 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {stats.balance >= 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                  )}
                  <p className={`text-sm font-bold ${stats.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                    {stats.balance >= 0 ? 'רווח חודשי' : 'גירעון'}
                  </p>
                </div>
                <p className={`text-3xl font-extrabold ${stats.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {stats.balance >= 0 ? '+' : '-'}
                  {formatCurrency(stats.balance)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1.5">שיעור חיסכון {stats.savingsRate}%</p>
              </div>
            </div>

            {/* Quick templates */}
            <div className="hf-card rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-indigo-500" /> תבניות מהירות
                </h3>
                <button
                  onClick={() => {
                    resetForm();
                    setFormType('transfer');
                    setActiveTab('add');
                  }}
                  className="text-xs font-semibold text-indigo-600 flex items-center gap-1 hover:text-indigo-500"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" /> העברה בין חשבונות
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    onClick={() => applyTemplate(tpl)}
                    className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors text-sm font-medium"
                  >
                    <span>{tpl.icon}</span>
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {isPremium ? (
              <div className="rounded-2xl p-6 text-white shadow-lg bg-gradient-to-l from-slate-900 to-slate-800">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-amber-300" /> שווי נטו
                    </h3>
                    <p className="text-slate-400 text-sm">נכסים פחות התחייבויות</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('assets')}
                    className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
                  >
                    פירוט מלא
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  <div>
                    <p className="text-slate-400 text-xs mb-1">נכסים</p>
                    <p className="font-bold text-emerald-400">{formatCurrency(netWorth.assets)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs mb-1">התחייבויות</p>
                    <p className="font-bold text-rose-400">{formatCurrency(netWorth.liabilities)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs mb-1">נטו</p>
                    <p className="font-bold text-amber-300 text-lg">{formatCurrency(netWorth.net)}</p>
                  </div>
                </div>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={netWorthHistory}>
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 12, border: 'none' }} />
                      <Line type="monotone" dataKey="שווי" stroke="#fbbf24" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="hf-card rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                      עקבו אחרי חשבונות ושווי נטו
                    </h3>
                    <p className="text-xs text-slate-500">אשראי, הלוואות ומשכנתא במקום אחד</p>
                  </div>
                </div>
                <button
                  onClick={openUpgrade}
                  className="flex items-center gap-1 bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-lg flex-shrink-0 hover:bg-indigo-500"
                >
                  <Lock className="w-3.5 h-3.5" /> פרימיום
                </button>
              </div>
            )}

            {/* Cashflow forecast */}
            <div className="hf-card p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold mb-1 text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" /> תחזית תזרים — 3 חודשים
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                מבוסס על תנועות קבועות ותשלומי הלוואות (ללא הוצאות חד־פעמיות)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {cashflowForecast.months.map((m) => (
                  <div
                    key={m.key}
                    className={`rounded-xl p-4 border ${
                      m.balance >= 0
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900'
                        : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900'
                    }`}
                  >
                    <p className="text-xs text-slate-500 mb-2">{m.label}</p>
                    <p className={`text-lg font-bold ${m.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {m.balance >= 0 ? '+' : '-'}
                      {formatCurrency(m.balance)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      הכנסות קבועות {formatCurrency(m.income)} · הוצאות {formatCurrency(m.expense)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="hf-card p-4 rounded-2xl border border-slate-100 dark:border-slate-800 h-72 flex flex-col">
              <h3 className="text-lg font-semibold mb-2 text-slate-700 dark:text-slate-200">מגמה — 6 חודשים</h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="הכנסות" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="הוצאות" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="hf-card p-4 rounded-2xl border border-slate-100 dark:border-slate-800 h-80 flex flex-col">
                <h3 className="text-lg font-semibold mb-4 text-slate-700 dark:text-slate-200">איפה הוצאנו יותר?</h3>
                <div className="flex-1">
                  {expensesByCategory.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expensesByCategory}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {expensesByCategory.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                        <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState icon={TrendingDown} title="אין הוצאות לחודש זה" hint="הוסיפו תנועה כדי לראות פירוט" />
                  )}
                </div>
              </div>

              <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-semibold mb-4 text-slate-700 dark:text-slate-200">
                  תובנות ל{formatMonthLabel(selectedMonth)}
                </h3>
                {filteredTransactions.length === 0 ? (
                  <EmptyState icon={Sparkles} title="עדיין אין נתונים" hint="הזינו תנועה ראשונה וקבלו תובנות" />
                ) : (
                  <ul className="space-y-3">
                    {expensesByCategory[0] && (
                      <li className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-xl text-indigo-800 dark:text-indigo-200">
                        <TrendingDown className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>שים לב!</strong> ההוצאה הגדולה ביותר: <strong>{expensesByCategory[0].name}</strong> (
                          {formatCurrency(expensesByCategory[0].value)}).
                        </div>
                      </li>
                    )}
                    <li
                      className={`flex items-start gap-3 p-3 rounded-xl ${
                        stats.balance >= 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
                      }`}
                    >
                      {stats.balance >= 0 ? (
                        <TrendingUp className="w-5 h-5 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        {stats.balance >= 0
                          ? `רווח של ${formatCurrency(stats.balance)} (${stats.savingsRate}% חיסכון). מומלץ להפקיד ליעד.`
                          : `אזהרה: גירעון של ${formatCurrency(stats.balance)} החודש.`}
                      </div>
                    </li>
                    {budgetProgress
                      .filter((b) => b.over)
                      .map((b) => (
                        <li
                          key={b.category}
                          className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl text-amber-800 dark:text-amber-200"
                        >
                          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                          <div>
                            חריגה מתקציב <strong>{b.category}</strong> ({formatCurrency(b.spent)} מתוך{' '}
                            {formatCurrency(b.amount)}).
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            {recurringSummary.length > 0 && (
              <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-semibold mb-4 text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-500" /> תשלומים קבועים
                </h3>
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {recurringSummary.map((t) => (
                    <div key={t.type + t.category} className="flex justify-between items-center py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                        <Repeat className="w-3.5 h-3.5 text-slate-400" /> {t.category}
                      </span>
                      <span className={`font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>
                        {t.type === 'income' ? '+' : '-'}
                        {formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                  {loans
                    .filter((l) => l.remainingAmount > 0)
                    .map((l) => (
                      <div key={`loan-${l.id}`} className="flex justify-between items-center py-2.5 text-sm">
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <Landmark className="w-3.5 h-3.5 text-slate-400" /> תשלום הלוואה: {l.name}
                        </span>
                        <span className="font-semibold">-{formatCurrency(l.monthlyPayment)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {budgetProgress.length > 0 && (
              <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-semibold mb-4 text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-500" /> תקציבים חודשיים
                </h3>
                <div className="space-y-4">
                  {budgetProgress.map((b) => (
                    <div key={b.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{b.category}</span>
                        <span className={b.over ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                          {formatCurrency(b.spent)} / {formatCurrency(b.amount)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-700 ${b.over ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          style={{ width: `${b.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => (isPremium ? setActiveTab('report') : openUpgrade())}
              className="w-full hf-card p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="text-right">
                  <h3 className="font-semibold text-sm">דוח חודשי מקצועי</h3>
                  <p className="text-xs text-slate-500">מסמך להדפסה או שמירה כ-PDF</p>
                </div>
              </div>
              {isPremium ? (
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              ) : (
                <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-bold px-2.5 py-1.5 rounded-lg">
                  <Lock className="w-3.5 h-3.5" /> פרימיום
                </span>
              )}
            </button>
          </div>
        )}

        {/* ADD / EDIT */}
        {activeTab === 'add' && (
          <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800 max-w-lg mx-auto animate-hf-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">{editingId ? 'עריכת תנועה' : 'הוספת תנועה'}</h2>
              {editingId && (
                <button onClick={resetForm} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">
                  <X className="w-4 h-4" /> ביטול עריכה
                </button>
              )}
            </div>

            <div className="flex gap-2 mb-6">
              {[
                { id: 'expense', label: 'הוצאה', active: 'bg-rose-100 text-rose-700 border-rose-500 dark:bg-rose-950/50 dark:text-rose-300' },
                { id: 'income', label: 'הכנסה', active: 'bg-emerald-100 text-emerald-700 border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300' },
                { id: 'transfer', label: 'העברה', active: 'bg-indigo-100 text-indigo-700 border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-300' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={`flex-1 py-2 rounded-xl font-medium transition-colors border-2 ${
                    formType === tab.id ? tab.active : 'bg-slate-100 dark:bg-slate-900 text-slate-500 border-transparent'
                  }`}
                  onClick={() => setFormType(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {formError}
              </div>
            )}
            {duplicateWarning && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> נמצאה תנועה דומה באותו תאריך וסכום — בדקו שאין כפילות.
              </div>
            )}

            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">סכום (₪)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none text-lg"
                  placeholder="0.00"
                />
              </div>

              {formType === 'transfer' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">מחשבון</label>
                    <select
                      value={formAccountId}
                      onChange={(e) => setFormAccountId(e.target.value)}
                      className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon} {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">לחשבון</label>
                    <select
                      value={formToAccountId}
                      onChange={(e) => setFormToAccountId(e.target.value)}
                      className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon} {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">קטגוריה</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {getOrderedCategories(formType === 'expense' ? expenseCategories : incomeCategories).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  {formCategory === 'אחר' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">פרטו את הקטגוריה</label>
                      <input
                        type="text"
                        required
                        value={formOtherText}
                        onChange={(e) => setFormOtherText(e.target.value)}
                        className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="לדוגמה: תרומה, ציוד לבית..."
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1">חשבון</label>
                    <select
                      value={formAccountId}
                      onChange={(e) => setFormAccountId(e.target.value)}
                      className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon} {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">תאריך</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none font-hebrew"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">הערות</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="לדוגמה: קניות לשבת"
                />
              </div>

              {formType !== 'transfer' && (
                <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={formRecurring}
                    onChange={(e) => setFormRecurring(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <Repeat className="w-4 h-4 text-slate-500" />
                  <span className="text-sm">תנועה קבועה (חוזרת כל חודש)</span>
                </label>
              )}

              <div className="mt-2 p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center">
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-indigo-600">העלה קבלה (בקרוב)</span>
                <span className="text-xs text-slate-500 mt-1">סריקת סכום אוטומטית תתווסף בהמשך</span>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-indigo-500 transition-colors mt-4 shadow-md"
              >
                {editingId
                  ? 'שמור שינויים'
                  : formType === 'transfer'
                    ? 'רשום העברה'
                    : `הוסף ${formType === 'expense' ? 'הוצאה' : 'הכנסה'}`}
              </button>
            </form>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="hf-card rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-hf-in">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center flex-wrap gap-2">
              <h2 className="text-xl font-bold">פירוט תנועות</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryAllMonths((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    historyAllMonths
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {historyAllMonths ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {historyAllMonths ? 'כל החודשים' : 'חודש נוכחי'}
                </button>
                <button
                  onClick={exportToCSV}
                  disabled={historySource.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-sm ${
                    historySource.length === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  <Download className="w-4 h-4" /> ייצוא
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="חיפוש לפי קטגוריה או הערה..."
                  className="w-full p-2.5 pr-9 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <select
                value={historyCategoryFilter}
                onChange={(e) => setHistoryCategoryFilter(e.target.value)}
                className="p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="all">כל הקטגוריות</option>
                {getOrderedCategories([...new Set(historySource.map((t) => t.category))]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {!historyAllMonths && (
              <div className="bg-slate-50 dark:bg-slate-900/60 p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center text-sm gap-2">
                <div className="flex gap-4">
                  <div>
                    <span className="text-slate-500">הכנסות:</span>{' '}
                    <span className="font-bold text-emerald-600">{formatCurrency(stats.income)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">הוצאות:</span>{' '}
                    <span className="font-bold text-rose-600">{formatCurrency(stats.expenses)}</span>
                  </div>
                </div>
                <div
                  className={`font-bold px-3 py-1 rounded-full ${
                    stats.balance >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {stats.balance >= 0 ? 'רווח: ' : 'גירעון: '}
                  {formatCurrency(stats.balance)}
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {historySource.length === 0 ? (
                <EmptyState icon={List} title="לא נמצאו תנועות" hint="נסו לשנות סינון או חודש" />
              ) : (
                historySource.map((t) => (
                  <div key={t.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors group">
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                          t.type === 'income'
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50'
                            : 'bg-rose-100 text-rose-600 dark:bg-rose-950/50'
                        }`}
                      >
                        {t.type === 'income' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold flex items-center gap-2 truncate">
                          {t.category}
                          {t.recurring && <Repeat className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
                        </h4>
                        <p className="text-sm text-slate-500 truncate">
                          {new Date(t.date).toLocaleDateString('he-IL')}
                          {t.notes && ` • ${t.notes}`}
                          {accounts.find((a) => a.id === t.accountId) &&
                            ` • ${accounts.find((a) => a.id === t.accountId).name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`font-bold text-lg ${t.type === 'income' ? 'text-emerald-600' : ''}`}>
                        {t.type === 'income' ? '+' : '-'}
                        {formatCurrency(t.amount)}
                      </span>
                      <button onClick={() => startEdit(t)} className="text-slate-300 hover:text-indigo-500 transition-colors">
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button onClick={() => deleteTransaction(t.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {transactions
                .filter((t) => t.type === 'transfer' && (historyAllMonths || t.date.startsWith(selectedMonth)))
                .map((t) => {
                  const from = accounts.find((a) => a.id === t.accountId);
                  const to = accounts.find((a) => a.id === t.toAccountId);
                  return (
                    <div key={t.id} className="p-4 flex items-center justify-between bg-indigo-50/40 dark:bg-indigo-950/20 group">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center">
                          <ArrowLeftRight className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold truncate">
                            העברה · {from?.name} → {to?.name}
                          </h4>
                          <p className="text-sm text-slate-500 truncate">
                            {new Date(t.date).toLocaleDateString('he-IL')}
                            {t.notes && ` • ${t.notes}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(t.amount)}</span>
                        <button onClick={() => startEdit(t)} className="text-slate-300 hover:text-indigo-500">
                          <Pencil className="w-5 h-5" />
                        </button>
                        <button onClick={() => deleteTransaction(t.id)} className="text-slate-300 hover:text-rose-500">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ASSETS */}
        {activeTab === 'assets' && (
          <div className="space-y-5 animate-hf-in">
            <div className="rounded-2xl p-6 text-white shadow-lg bg-gradient-to-l from-slate-900 to-slate-800">
              <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-amber-300" /> נכסים והתחייבויות
              </h2>
              <p className="text-slate-400 text-sm">התמונה הפיננסית המלאה של המשפחה.</p>
            </div>

            {!isPremium ? (
              <PremiumLock
                title="נכסים ושווי נטו הם פיצ'ר פרימיום"
                description="עקבו אחרי חשבונות, אשראי והלוואות — ושווי נטו מתעדכן בזמן אמת."
                onUpgrade={openUpgrade}
              />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="hf-card p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-500 mb-1">נכסים</p>
                    <p className="font-bold text-emerald-600">{formatCurrency(netWorth.assets)}</p>
                  </div>
                  <div className="hf-card p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-500 mb-1">התחייבויות</p>
                    <p className="font-bold text-rose-600">{formatCurrency(netWorth.liabilities)}</p>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-950/40 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900 text-center">
                    <p className="text-xs text-indigo-500 mb-1">שווי נטו</p>
                    <p className="font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(netWorth.net)}</p>
                  </div>
                </div>

                <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Banknote className="w-5 h-5 text-indigo-500" /> חשבונות
                    </h3>
                    <button
                      onClick={() => {
                        if (showNewAccountForm) resetAccountForm();
                        else {
                          setEditingAccountId(null);
                          setShowNewAccountForm(true);
                        }
                      }}
                      className="text-indigo-600 hover:text-indigo-500"
                      aria-label={showNewAccountForm ? 'סגור' : 'חשבון חדש'}
                    >
                      {showNewAccountForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    </button>
                  </div>

                  {showNewAccountForm && (
                    <form onSubmit={addAccount} className="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2">
                      <p className="text-sm font-semibold">{editingAccountId ? 'עריכת חשבון' : 'חשבון חדש'}</p>
                      <input
                        type="text"
                        required
                        placeholder="שם החשבון"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                      />
                      <div className="flex gap-2">
                        <select
                          value={newAccountType}
                          onChange={(e) => setNewAccountType(e.target.value)}
                          className="flex-1 p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        >
                          <option value="checking">עו"ש</option>
                          <option value="cash">מזומן</option>
                          <option value="credit">אשראי</option>
                        </select>
                        <input
                          type="number"
                          placeholder="יתרת פתיחה"
                          value={newAccountBalance}
                          onChange={(e) => setNewAccountBalance(e.target.value)}
                          className="flex-1 p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>
                      <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-500">
                        {editingAccountId ? 'שמור שינויים' : 'הוסף חשבון'}
                      </button>
                    </form>
                  )}

                  <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {accountBalances.map((a) => (
                      <div key={a.id} className="flex justify-between items-center py-3 gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl">{a.icon}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{a.name}</p>
                            <p className="text-xs text-slate-400">{ACCOUNT_TYPES[a.type]}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`font-bold ${a.type === 'credit' && a.balance < 0 ? 'text-rose-600' : ''}`}>
                            {a.balance < 0 ? '-' : ''}
                            {formatCurrency(a.balance)}
                          </span>
                          <button onClick={() => startEditAccount(a)} className="text-xs font-bold text-indigo-600 hover:underline">
                            ערוך
                          </button>
                          <button onClick={() => deleteAccount(a.id)} className="text-xs font-bold text-rose-600 hover:underline">
                            מחק
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Landmark className="w-5 h-5 text-indigo-500" /> הלוואות
                    </h3>
                    <button
                      onClick={() => {
                        if (showNewLoanForm) resetLoanForm();
                        else {
                          setEditingLoanId(null);
                          setShowNewLoanForm(true);
                        }
                      }}
                      className="text-indigo-600 hover:text-indigo-500"
                      aria-label={showNewLoanForm ? 'סגור' : 'הלוואה חדשה'}
                    >
                      {showNewLoanForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    </button>
                  </div>

                  {showNewLoanForm && (
                    <form onSubmit={addLoan} className="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2">
                      <p className="text-sm font-semibold">{editingLoanId ? 'עריכת הלוואה' : 'הלוואה חדשה'}</p>
                      <input
                        type="text"
                        required
                        placeholder="שם ההלוואה"
                        value={newLoanName}
                        onChange={(e) => setNewLoanName(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          required
                          placeholder="סכום מקורי"
                          value={newLoanTotal}
                          onChange={(e) => setNewLoanTotal(e.target.value)}
                          className="flex-1 p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                        <input
                          type="number"
                          placeholder="יתרה נוכחית"
                          value={newLoanRemaining}
                          onChange={(e) => setNewLoanRemaining(e.target.value)}
                          className="flex-1 p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>
                      <input
                        type="number"
                        placeholder="תשלום חודשי"
                        value={newLoanPayment}
                        onChange={(e) => setNewLoanPayment(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                      />
                      <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-500">
                        {editingLoanId ? 'שמור שינויים' : 'הוסף הלוואה'}
                      </button>
                    </form>
                  )}

                  <div className="space-y-4">
                    {loans.map((l) => {
                      const paidPercent = Math.round(((l.totalAmount - l.remainingAmount) / l.totalAmount) * 100);
                      const schedule = loanSchedule(l);
                      return (
                        <div key={l.id} className="border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-sm flex items-center gap-2">
                              {l.icon} {l.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-500">נותר {formatCurrency(l.remainingAmount)}</span>
                              <button onClick={() => startEditLoan(l)} className="text-xs font-bold text-indigo-600 hover:underline">
                                ערוך
                              </button>
                              <button onClick={() => deleteLoan(l.id)} className="text-xs font-bold text-rose-600 hover:underline">
                                מחק
                              </button>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 mb-2 overflow-hidden">
                            <div className="h-2.5 bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${paidPercent}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-slate-400 mb-3">
                            <span>{paidPercent}% שולם</span>
                            <span>סה"כ {formatCurrency(l.totalAmount)}</span>
                          </div>
                          {l.remainingAmount > 0 && (
                            <div className="flex gap-2 mb-3">
                              <input
                                type="number"
                                min="1"
                                placeholder={`תשלום (${formatCurrency(l.monthlyPayment)})`}
                                value={loanPaymentInputs[l.id] || ''}
                                onChange={(e) => setLoanPaymentInputs((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                className="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                              />
                              <button
                                onClick={() => payLoan(l.id)}
                                className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium"
                              >
                                רשום תשלום
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => setExpandedLoanId(expandedLoanId === l.id ? null : l.id)}
                            className="text-xs text-indigo-600 font-semibold"
                          >
                            {expandedLoanId === l.id ? 'הסתר סילוקין' : 'הצג 6 תשלומים הבאים'}
                          </button>
                          {expandedLoanId === l.id && schedule.length > 0 && (
                            <div className="mt-3 space-y-1.5 text-xs">
                              {schedule.map((row) => (
                                <div key={row.n} className="flex justify-between text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-1.5">
                                  <span>תשלום #{row.n}</span>
                                  <span>
                                    {formatCurrency(row.pay)} · יתרה {formatCurrency(row.remaining)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* GOALS */}
        {activeTab === 'goals' && (
          <div className="space-y-5 animate-hf-in">
            <div className="rounded-2xl p-6 text-white shadow-lg flex justify-between items-center bg-gradient-to-l from-indigo-700 to-indigo-500">
              <div>
                <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-amber-300" /> היעדים של המשפחה
                </h2>
                <p className="text-indigo-100 text-sm">הרווח החודשי הופך לחלומות.</p>
              </div>
              <button
                onClick={() => {
                  if (showNewGoalForm) resetGoalForm();
                  else {
                    setEditingGoalId(null);
                    setShowNewGoalForm(true);
                  }
                }}
                className="bg-white/20 hover:bg-white/30 p-3 rounded-full transition-colors"
                aria-label={showNewGoalForm ? 'סגור' : 'יעד חדש'}
              >
                {showNewGoalForm ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
              </button>
            </div>

            {showNewGoalForm && (
              <form onSubmit={addGoal} className="hf-card p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                <h3 className="font-semibold">{editingGoalId ? 'עריכת יעד' : 'יעד חדש'}</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newGoalIcon}
                    onChange={(e) => setNewGoalIcon(e.target.value)}
                    className="w-16 p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-center text-xl bg-white dark:bg-slate-950"
                    maxLength={2}
                  />
                  <input
                    type="text"
                    required
                    placeholder="שם היעד"
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    className="flex-1 p-3 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950"
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="סכום יעד (₪)"
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="כבר נחסך (₪)"
                  value={newGoalCurrent}
                  onChange={(e) => setNewGoalCurrent(e.target.value)}
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950"
                />
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl hover:bg-indigo-500">
                  {editingGoalId ? 'שמור שינויים' : 'צור יעד'}
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map((goal) => {
                const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
                const complete = percent >= 100;
                return (
                  <div
                    key={goal.id}
                    className={`hf-card p-5 rounded-2xl border hover:shadow-md transition-shadow ${
                      complete ? 'border-emerald-200 dark:border-emerald-900' : 'border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-center text-2xl border border-slate-100 dark:border-slate-800">
                        {goal.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-lg truncate">{goal.title}</h3>
                        <p className={`text-sm ${complete ? 'text-emerald-600 font-semibold' : 'text-slate-500'}`}>
                          {complete ? 'הושלם!' : `${percent}% הושגו`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEditGoal(goal)} className="text-xs font-bold text-indigo-600 hover:underline">
                          ערוך
                        </button>
                        <button onClick={() => deleteGoal(goal.id)} className="text-xs font-bold text-rose-600 hover:underline">
                          מחק
                        </button>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3.5 mb-2 overflow-hidden">
                      <div
                        className={`h-3.5 rounded-full ${complete ? 'bg-emerald-500' : goal.color} transition-all duration-1000`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm font-medium mt-3 mb-3">
                      <span className="text-slate-500">
                        נחסך: <span className="text-slate-800 dark:text-slate-100">{formatCurrency(goal.currentAmount)}</span>
                      </span>
                      <span className="text-slate-400">יעד: {formatCurrency(goal.targetAmount)}</span>
                    </div>
                    {!complete && (
                      <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <input
                          type="number"
                          min="1"
                          placeholder="הוסף סכום"
                          value={contribInputs[goal.id] || ''}
                          onChange={(e) => setContribInputs((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                          className="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950"
                        />
                        <button
                          onClick={() => contributeToGoal(goal.id)}
                          className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 rounded-lg text-sm font-medium flex items-center gap-1"
                        >
                          <PiggyBank className="w-4 h-4" /> הפקד
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-5 animate-hf-in">
            <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-indigo-500" /> פרופיל משפחה
              </h2>
              <label className="block text-sm font-medium mb-1">שם המשפחה באפליקציה</label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" /> המנוי שלי
              </h2>
              <p className="text-sm text-slate-400 mb-4">
                {userEmail ? <span className="block mb-1 text-slate-500">{userEmail}</span> : null}
                פרימיום נפתח רק אחרי תשלום מאובטח ב-Stripe. הביטול דרך פורטל החיוב.
              </p>
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-4 rounded-xl">
                <div>
                  <p className="font-semibold">{isPremium ? 'מסלול פרימיום' : 'מסלול חינמי'}</p>
                  <p className="text-xs text-slate-500">
                    {isPremium ? `₪${PREMIUM_PRICE} לחודש` : 'ללא נכסים, הלוואות או דוח חודשי'}
                  </p>
                </div>
                {isPremium ? (
                  <button onClick={() => onManageBilling?.()} className="text-xs text-slate-400 underline">
                    ניהול חיוב
                  </button>
                ) : (
                  <button onClick={openUpgrade} className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-indigo-500">
                    שדרג
                  </button>
                )}
              </div>
            </div>

            <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-indigo-500" /> ניהול קטגוריות
              </h2>
              <form onSubmit={addCategory} className="flex flex-col md:flex-row gap-2 mb-6">
                <select
                  value={newCategoryType}
                  onChange={(e) => setNewCategoryType(e.target.value)}
                  className="p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                >
                  <option value="expense">הוצאה</option>
                  <option value="income">הכנסה</option>
                </select>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="שם קטגוריה חדשה"
                  className="flex-1 p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950"
                />
                <button type="submit" className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500">
                  הוסף
                </button>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">קטגוריות הוצאה</h3>
                  <div className="flex flex-wrap gap-2">
                    {getOrderedCategories(expenseCategories).map((cat) => (
                      <span key={cat} className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-full text-sm">
                        {cat}
                        {cat !== 'אחר' && (
                          <button onClick={() => removeCategory(cat, 'expense')} className="text-rose-400 hover:text-rose-700">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">קטגוריות הכנסה</h3>
                  <div className="flex flex-wrap gap-2">
                    {getOrderedCategories(incomeCategories).map((cat) => (
                      <span key={cat} className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full text-sm">
                        {cat}
                        {cat !== 'אחר' && (
                          <button onClick={() => removeCategory(cat, 'income')} className="text-emerald-400 hover:text-emerald-700">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="hf-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-500" /> תקציבים חודשיים
              </h2>
              <p className="text-sm text-slate-400 mb-4">הגדירו תקציב — נציג התראה בחריגה.</p>
              <div className="space-y-3">
                {expenseCategories.map((cat) => (
                  <div key={cat} className="flex items-center justify-between gap-3">
                    <span className="text-sm flex-1">{cat}</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="ללא תקציב"
                      value={budgets[cat] ?? ''}
                      onChange={(e) => updateBudget(cat, e.target.value)}
                      className="w-32 p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-left focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Toast + Undo */}
      <div className="fixed bottom-24 inset-x-0 z-40 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {deletedTx && (
          <div className="pointer-events-auto animate-hf-toast flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl text-sm">
            <span>התנועה נמחקה</span>
            <button onClick={undoDelete} className="flex items-center gap-1 font-bold text-amber-300 hover:text-amber-200">
              <Undo2 className="w-4 h-4" /> בטל
            </button>
          </div>
        )}
        {toast && !deletedTx && (
          <div
            className={`pointer-events-auto animate-hf-toast px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium text-white ${
              toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'warn' ? 'bg-amber-600' : 'bg-slate-800'
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 w-full bg-white/95 dark:bg-slate-950/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-safe pt-2 px-1 flex justify-between items-center z-30">
        {[
          { id: 'dashboard', icon: Home, label: 'ראשי' },
          { id: 'assets', icon: Building2, label: 'נכסים', lock: !isPremium },
          { id: 'goals', icon: Target, label: 'יעדים' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center p-1.5 rounded-xl transition-colors flex-1 relative ${
              activeTab === item.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <item.icon className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-medium">{item.label}</span>
            {item.lock && <Lock className="w-2.5 h-2.5 absolute top-0 right-3 text-amber-500" />}
          </button>
        ))}

        <div className="relative -top-6 px-1.5">
          <button
            onClick={() => {
              resetForm();
              setActiveTab('add');
            }}
            className="bg-indigo-600 text-white rounded-full p-3.5 shadow-lg shadow-indigo-200 dark:shadow-indigo-950 hover:bg-indigo-500 hover:scale-105 transition-all"
          >
            <PlusCircle className="w-7 h-7" />
          </button>
        </div>

        {[
          { id: 'history', icon: List, label: 'פירוט' },
          { id: 'settings', icon: SettingsIcon, label: 'הגדרות' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center p-1.5 rounded-xl transition-colors flex-1 ${
              activeTab === item.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <item.icon className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowUpgradeModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <h3 className="text-xl font-bold mb-1">HouseFin פרימיום</h3>
            <p className="text-3xl font-bold mb-4">
              ₪{PREMIUM_PRICE}
              <span className="text-sm font-normal text-slate-400"> / לחודש</span>
            </p>
            <ul className="space-y-2 mb-6 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> ריבוי חשבונות ויתרות
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> מעקב הלוואות וסילוקין
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> שווי נטו + מגמה
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> דוח חודשי להדפסה
              </li>
            </ul>
            <button
              onClick={async () => {
                setShowUpgradeModal(false);
                showToast('מעבירים לתשלום מאובטח...', 'info');
                await onUpgrade?.();
              }}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500"
            >
              המשך לתשלום מאובטח
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">Stripe · ניתן לבטל בכל עת</p>
          </div>
        </div>
      )}
    </div>
  );
}