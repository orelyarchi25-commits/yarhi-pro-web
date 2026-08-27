/**
 * מעביר workspace מקבלני Firebase ל-Supabase (CRM, הכנסות/הוצאות, לו״ז, הגדרות).
 *
 * שימוש:
 *   node scripts/migrate-firebase-to-supabase.mjs              # סימולציה בלבד
 *   node scripts/migrate-firebase-to-supabase.mjs --apply      # ביצוע אמיתי
 *   node scripts/migrate-firebase-to-supabase.mjs --apply --overwrite
 *
 * התאמה לפי אימייל. סיסמת Firebase לא עוברת — אם אין חשבון Supabase,
 * נוצר חשבון מאושר והקבלן נכנס דרך «שכחתי סיסמה».
 */
import { readFileSync, existsSync } from "fs";
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
    const k = m[1];
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");

function toPlain(value) {
  if (value == null) return value;
  if (typeof value.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number" && "nanoseconds" in value) {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6)).toISOString();
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

function accessUntilIso(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const plain = toPlain(raw);
  if (typeof plain === "string") return plain;
  return null;
}

function summarizeWorkspace(ws) {
  if (!ws || typeof ws !== "object") {
    return { crm: 0, txs: 0, jobs: 0, windows: 0, empty: true };
  }
  return {
    crm: Array.isArray(ws.crmProjects) ? ws.crmProjects.length : 0,
    txs: Array.isArray(ws.businessTransactions) ? ws.businessTransactions.length : 0,
    jobs: Array.isArray(ws.scheduleJobs) ? ws.scheduleJobs.length : 0,
    windows: Array.isArray(ws.fieldWindowRecords) ? ws.fieldWindowRecords.length : 0,
    empty: false,
  };
}

async function listAllSupabaseUsers(sb) {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 200) break;
    page += 1;
    if (page > 50) break;
  }
  return users;
}

async function findOrCreateSupabaseUser(sb, email) {
  const existing = (await listAllSupabaseUsers(sb)).find(
    (u) => (u.email || "").toLowerCase() === email
  );
  if (existing) return { user: existing, created: false };

  const { data, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data?.user) throw new Error(`createUser returned empty for ${email}`);
  return { user: data.user, created: true };
}

async function main() {
  const { cert, getApps, initializeApp } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  const { getFirestore } = require("firebase-admin/firestore");

  const jsonFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const pathFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || "./firebase-service-account.json";
  let raw;
  if (jsonFromEnv) raw = jsonFromEnv;
  else {
    const abs =
      pathFromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathFromEnv)
        ? pathFromEnv
        : join(root, pathFromEnv.replace(/^\.\//, ""));
    if (!existsSync(abs)) {
      throw new Error(`חסר קובץ Firebase Admin: ${abs}\nשים firebase-service-account.json בשורש או מלא FIREBASE_SERVICE_ACCOUNT_* ב-.env.local`);
    }
    raw = readFileSync(abs, "utf8");
  }

  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(raw.trim())) });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error("חסר NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY ב-.env.local");
  }
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const snap = await db.collection("users").get();
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN (לא נשמר כלום) ===");
  console.log(`Firebase users docs: ${snap.size}`);

  const results = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    let email = String(data.email || "").trim().toLowerCase();
    if (!email) {
      try {
        const fu = await auth.getUser(doc.id);
        email = String(fu.email || "").trim().toLowerCase();
      } catch {
        /* ignore */
      }
    }
    const ws = toPlain(data.yarhiWorkspace || null);
    const summary = summarizeWorkspace(ws);
    const approved = data.accountApproved === true;
    const until = accessUntilIso(data.accessValidUntil);

    const row = {
      firebaseUid: doc.id,
      email: email || "(אין אימייל)",
      approved,
      until,
      ...summary,
      action: "skip",
      note: "",
    };

    if (!email) {
      row.note = "אין אימייל — אי אפשר להתאים ל-Supabase";
      results.push(row);
      continue;
    }
    if (summary.empty && summary.crm === 0 && summary.txs === 0) {
      row.note = "אין yarhiWorkspace (אפשר עדיין ליצור פרופיל)";
    }

    if (!APPLY) {
      row.action = "would-migrate";
      results.push(row);
      continue;
    }

    try {
      const { user, created } = await findOrCreateSupabaseUser(sb, email);
      const userId = user.id;
      const profilePayload = {
        id: userId,
        email,
        business_name: String(data.businessName || data.sysContractorName || data.contractorName || ""),
        contractor_name: String(data.contractorName || data.businessName || ""),
        phone: String(data.phone || ""),
        registration_plan: String(data.registrationPlan || ""),
        payment_method: String(data.paymentMethod || ""),
        payment_proof_file_name: data.paymentProofFileName || null,
        terms_accepted_at: accessUntilIso(data.termsAcceptedAt) || new Date().toISOString(),
        terms_version: String(data.termsVersion || "migrated"),
        account_approved: approved,
        access_valid_until: until,
        updated_at: new Date().toISOString(),
      };

      const { error: profileErr } = await sb.from("profiles").upsert(profilePayload, { onConflict: "id" });
      if (profileErr) throw new Error(`profile: ${profileErr.message}`);

      const { data: existingWs, error: wsReadErr } = await sb
        .from("workspaces")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();
      if (wsReadErr) throw new Error(`workspace read: ${wsReadErr.message}`);

      const existingSummary = summarizeWorkspace(existingWs?.data);
      const hasExistingData = !existingSummary.empty && (existingSummary.crm > 0 || existingSummary.txs > 0);
      if (hasExistingData && !OVERWRITE) {
        row.action = "kept-existing-supabase";
        row.note = `Supabase כבר יש CRM=${existingSummary.crm} txs=${existingSummary.txs} (הוסף --overwrite כדי לדרוס)`;
        results.push(row);
        continue;
      }

      if (ws) {
        const { error: wsErr } = await sb.from("workspaces").upsert({
          user_id: userId,
          data: ws,
          updated_at: new Date().toISOString(),
        });
        if (wsErr) throw new Error(`workspace: ${wsErr.message}`);
      }

      row.action = created ? "created+migrated" : "migrated";
      row.note = created ? "נוצר חשבון Supabase — הקבלן ייכנס דרך שכחתי סיסמה" : "חשבון Supabase קיים, הנתונים הועתקו";
    } catch (err) {
      row.action = "error";
      row.note = err instanceof Error ? err.message : String(err);
    }
    results.push(row);
  }

  for (const r of results) {
    console.log(
      `${r.action.padEnd(24)} ${r.email.padEnd(32)} crm=${r.crm} txs=${r.txs} jobs=${r.jobs} ${r.note}`
    );
  }
  const ok = results.filter((r) => r.action === "migrated" || r.action === "created+migrated" || r.action === "would-migrate").length;
  const errN = results.filter((r) => r.action === "error").length;
  console.log(`\nסיכום: ${results.length} קבלנים | מועמדים/הועברו: ${ok} | שגיאות: ${errN}`);
  if (!APPLY) {
    console.log("כדי לבצע באמת: node scripts/migrate-firebase-to-supabase.mjs --apply");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
