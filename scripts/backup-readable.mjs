/**
 * גיבוי קריא לאקסל / דפדפן — לקוחות, CRM, הכנסות, הוצאות.
 * מצלם גם Firebase וגם Supabase (שני העננים).
 *
 *   node scripts/backup-readable.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

function money(n) {
  const v = Number(n) || 0;
  return v ? v.toLocaleString("he-IL") : "";
}

function kindOf(p) {
  if (p?.isBundle) return "פרויקט משולב";
  if (p?.isFence) return "גדר";
  if (p?.isFieldWindows) return "חלונות";
  if (p?.isLead) return "ליד";
  return "פרגולה";
}

function htmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tableHtml(title, headers, rows, scroll = false) {
  const th = headers.map((h) => `<th>${htmlEscape(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${htmlEscape(c)}</td>`).join("")}</tr>`)
    .join("\n");
  const wrapOpen = scroll ? `<div class="table-scroll">` : "";
  const wrapClose = scroll ? `</div>` : "";
  return `<h2>${htmlEscape(title)}</h2>
  ${wrapOpen}<table>
    <thead><tr>${th}</tr></thead>
    <tbody>${body || `<tr><td colspan="${headers.length}">אין נתונים</td></tr>`}</tbody>
  </table>${wrapClose}`;
}

/** כל שדות «הגדרות עסק» מהאתר — כותרות בעברית לגיבוי הקריא */
const BUSINESS_SETTING_COLUMNS = [
  { key: "sysContractorName", label: "שם הקבלן / חברה" },
  { key: "sysCompanyId", label: "ח.פ / ע.מ" },
  { key: "sysPhone", label: "טלפון" },
  { key: "sysEmail", label: "אימייל" },
  { key: "sysAddress", label: "כתובת" },
  { key: "simCaption", label: "כיתוב הדמיה" },
  { key: "sellPricePerSqm", label: "מחיר מ״ר פרגולה" },
  { key: "pricePerKg", label: "מחיר אלומיניום לק״ג" },
  { key: "sysInstallPriceSqm", label: "התקנה למ״ר" },
  { key: "sysTransportPrice", label: "הובלה" },
  { key: "sysSantafPrice", label: "סנטף למ״ר" },
  { key: "sysLedPrice", label: "לד למטר" },
  { key: "sysScrewPrice", label: "ברגים (ל־1000)" },
  { key: "sysDripEdgePrice", label: "אף מים" },
  { key: "sysFencePriceSqm", label: "גדר למ״ר" },
  { key: "sysFenceSetPrice", label: "סט עמוד גדר" },
  { key: "sysJumboPrice", label: "ג׳מבו בודד" },
  { key: "sysVitrine7000PriceSqm", label: "ויטרינה 7000 למ״ר" },
  { key: "sysVitrine9000PriceSqm", label: "ויטרינה 9000 למ״ר" },
  { key: "sysVatPercent", label: "מע״מ %" },
  { key: "sysQuoteDeliveryDays", label: "ימי אספקה" },
  { key: "sysWorkWarrantyYears", label: "שנות אחריות" },
  { key: "sysPaymentStage1Percent", label: "תשלום שלב 1 %" },
  { key: "sysPaymentStage2Percent", label: "תשלום שלב 2 %" },
  { key: "sysPaymentStage3Percent", label: "תשלום שלב 3 %" },
];

function cloudSavedAtText(data) {
  const v = data?.cloudSavedAt;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof v.toDate === "function") {
    try {
      return v.toDate().toISOString();
    } catch {
      return "";
    }
  }
  if (v && typeof v === "object" && typeof v.seconds === "number") {
    return new Date(v.seconds * 1000).toISOString();
  }
  return "";
}

function pushWorkspace(out, { source, email, business, contractor, phone, approved, updatedAt, data }) {
  const crm = Array.isArray(data?.crmProjects) ? data.crmProjects : [];
  const txs = Array.isArray(data?.businessTransactions) ? data.businessTransactions : [];
  const wins = Array.isArray(data?.fieldWindowRecords) ? data.fieldWindowRecords : [];
  const name = business || contractor || email || "";

  out.contractors.push([
    source,
    email || "",
    business || "",
    contractor || "",
    phone || "",
    approved ? "מאושר" : "ממתין",
    String(crm.length),
    String(txs.length),
    updatedAt || "",
  ]);

  for (const c of crm) {
    const fs = c.formState && typeof c.formState === "object" ? c.formState : {};
    out.crmRows.push([
      source,
      name,
      c.customer || "",
      fs.custPhone || fs.fenceCustPhone || "",
      fs.custAddress || fs.fenceCustAddress || "",
      kindOf(c),
      c.crmStatus || "",
      c.date || "",
      money(c.sellingPriceInc),
      money(c.income),
      money(c.estExpense),
      fs.lengthWall || "",
      fs.exitWidth || "",
      fs.postHeight || "",
    ]);
  }

  for (const t of txs) {
    out.txRows.push([
      source,
      name,
      t.date || "",
      t.type === "income" ? "הכנסה" : "הוצאה",
      money(t.amount),
      t.description || "",
      t.category || "",
      t.incomeCustomerName || t.linkedCustomerName || "",
      t.incomeCustomerPhone || "",
      t.incomeWorkDetails || "",
    ]);
  }

  for (const w of wins) {
    out.winRows.push([
      source,
      name,
      w.title || w.customer || "",
      w.createdAt || "",
      Array.isArray(w.windows) ? w.windows.length : "",
    ]);
  }

  const bs = data?.businessSettings && typeof data.businessSettings === "object" ? data.businessSettings : {};
  const hasAnySetting = BUSINESS_SETTING_COLUMNS.some((c) => String(bs[c.key] ?? "").trim() !== "");
  // רק קבלנים עם הגדרות עסק אמיתיות — בלי שורות ריקות של כל הפרופילים
  if (!hasAnySetting) return;
  out.settingsRows.push([
    source,
    email || "",
    name,
    ...BUSINESS_SETTING_COLUMNS.map((c) => String(bs[c.key] ?? "")),
    cloudSavedAtText(data),
  ]);
}

async function loadFirebaseWorkspaces() {
  const jsonFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const pathFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || "./firebase-service-account.json";
  let raw;
  if (jsonFromEnv) raw = jsonFromEnv;
  else {
    const abs =
      pathFromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathFromEnv)
        ? pathFromEnv
        : join(root, pathFromEnv.replace(/^\.\//, ""));
    if (!existsSync(abs)) return [];
    raw = readFileSync(abs, "utf8");
  }

  const { cert, getApps, initializeApp } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(raw.trim())) });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const snap = await db.collection("users").get();
  const rows = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    let email = String(data.email || "").trim().toLowerCase();
    if (!email) {
      try {
        email = String((await auth.getUser(doc.id)).email || "").trim().toLowerCase();
      } catch {
        /* ignore */
      }
    }
    rows.push({
      source: "Firebase",
      email,
      business: data.businessName || data.sysContractorName || "",
      contractor: data.contractorName || "",
      phone: data.phone || "",
      approved: data.accountApproved === true,
      updatedAt: "",
      data: data.yarhiWorkspace && typeof data.yarhiWorkspace === "object" ? data.yarhiWorkspace : {},
    });
  }
  return rows;
}

async function loadSupabaseWorkspaces() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return [];

  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profiles, error: pErr } = await sb.from("profiles").select("*");
  if (pErr) throw new Error(pErr.message);
  const { data: workspaces, error: wErr } = await sb.from("workspaces").select("user_id, data, updated_at");
  if (wErr) throw new Error(wErr.message);
  const wsById = new Map((workspaces || []).map((w) => [w.user_id, w]));

  return (profiles || []).map((p) => {
    const ws = wsById.get(p.id);
    return {
      source: "Supabase",
      email: p.email || "",
      business: p.business_name || "",
      contractor: p.contractor_name || "",
      phone: p.phone || "",
      approved: p.account_approved === true,
      updatedAt: ws?.updated_at ? String(ws.updated_at).slice(0, 16).replace("T", " ") : "",
      data: ws?.data && typeof ws.data === "object" ? ws.data : {},
    };
  });
}

async function main() {
  const firebaseRows = await loadFirebaseWorkspaces();
  const supabaseRows = await loadSupabaseWorkspaces();
  if (firebaseRows.length === 0 && supabaseRows.length === 0) {
    throw new Error("אין Firebase ואין Supabase ב-.env.local");
  }

  const out = { contractors: [], crmRows: [], txRows: [], winRows: [], settingsRows: [] };
  for (const row of [...firebaseRows, ...supabaseRows]) pushWorkspace(out, row);

  const dir = join(root, "backups", `קריא-${stamp()}`);
  mkdirSync(dir, { recursive: true });

  const hContractors = [
    "מקור",
    "אימייל קבלן",
    "שם עסק",
    "שם קבלן",
    "טלפון",
    "סטטוס",
    "כמות לקוחות CRM",
    "כמות תנועות",
    "עודכן",
  ];
  const hCrm = [
    "מקור",
    "קבלן",
    "לקוח",
    "טלפון לקוח",
    "כתובת",
    "סוג",
    "סטטוס CRM",
    "תאריך",
    "מחיר כולל מע״מ",
    "הכנסה",
    "הוצאה משוערת",
    "אורך קיר",
    "יציאה",
    "גובה עמודים",
  ];
  const hTx = ["מקור", "קבלן", "תאריך", "סוג", "סכום", "תיאור", "קטגוריה", "שם לקוח בתנועה", "טלפון", "פירוט עבודה"];
  const hWin = ["מקור", "קבלן", "כותרת / לקוח", "תאריך", "כמות פתחים"];
  const hSettings = [
    "מקור",
    "אימייל קבלן",
    "קבלן",
    ...BUSINESS_SETTING_COLUMNS.map((c) => c.label),
    "נשמר בענן",
  ];

  writeFileSync(join(dir, "1-קבלנים.csv"), toCsv(hContractors, out.contractors), "utf8");
  writeFileSync(join(dir, "2-לקוחות-CRM.csv"), toCsv(hCrm, out.crmRows), "utf8");
  writeFileSync(join(dir, "3-הכנסות-הוצאות.csv"), toCsv(hTx, out.txRows), "utf8");
  writeFileSync(join(dir, "4-מידות-חלונות.csv"), toCsv(hWin, out.winRows), "utf8");
  writeFileSync(join(dir, "5-הגדרות-עסק.csv"), toCsv(hSettings, out.settingsRows), "utf8");

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>גיבוי Yarhi Pro — קריא</title>
  <style>
    body { font-family: Assistant, Arial, sans-serif; background:#f8fafc; color:#0f172a; padding:24px; }
    h1 { margin:0 0 8px; }
    .sub { color:#64748b; margin-bottom:16px; }
    .note { background:#fff7ed; border:1px solid #fdba74; padding:12px 14px; margin-bottom:24px; }
    table { border-collapse: collapse; width:100%; background:#fff; margin-bottom:32px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    th, td { border:1px solid #e2e8f0; padding:8px 10px; text-align:right; font-size:14px; white-space:nowrap; }
    th { background:#1e3a8a; color:#fff; }
    tr:nth-child(even) td { background:#f1f5f9; }
    h2 { color:#1e40af; }
    .table-scroll { overflow-x:auto; margin-bottom:32px; }
    .table-scroll table { margin-bottom:0; min-width:1400px; }
  </style>
</head>
<body>
  <h1>גיבוי Yarhi Pro</h1>
  <p class="sub">${htmlEscape(new Date().toLocaleString("he-IL"))} · ${out.contractors.length} שורות קבלנים · ${out.crmRows.length} לקוחות · ${out.txRows.length} תנועות · ${out.settingsRows.length} הגדרות עסק</p>
  <p class="note">הגיבוי מצלם את <b>הענן</b> (Firebase + Supabase), לא את מה שנשאר רק במסך הדפדפן. עמודה «מקור» אומרת מאיזה ענן השורה. אם האתר החי שונה מהקובץ — בדקו שפתחתם את התיקייה עם השעה הכי מאוחרת. בטבלת הגדרות עסק יש גלילה הצידה לכל המחירים.</p>
  ${tableHtml("קבלנים", hContractors, out.contractors)}
  ${tableHtml("לקוחות CRM", hCrm, out.crmRows)}
  ${tableHtml("הגדרות עסק", hSettings, out.settingsRows, true)}
  ${tableHtml("הכנסות והוצאות", hTx, out.txRows)}
  ${tableHtml("מידות חלונות", hWin, out.winRows)}
</body>
</html>`;
  const htmlPath = join(dir, "פתח-אותי.html");
  writeFileSync(htmlPath, html, "utf8");

  console.log(`נשמר ב: ${dir}`);
  console.log(`Firebase: ${firebaseRows.length} | Supabase: ${supabaseRows.length}`);
  console.log(`קבלנים: ${out.contractors.length} | לקוחות: ${out.crmRows.length} | תנועות: ${out.txRows.length}`);
  console.log(`HTML: ${htmlPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
