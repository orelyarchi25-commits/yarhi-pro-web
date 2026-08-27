/**
 * מעתיק workspace נוכחי מ-Firebase ל-Supabase לפי אימייל (סנכרון מהחי).
 *   node scripts/sync-firebase-to-supabase.mjs           # בדיקה
 *   node scripts/sync-firebase-to-supabase.mjs --apply   # העתקה
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
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const APPLY = process.argv.includes("--apply");

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
    return new Date(value.seconds * 1000).toISOString();
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

function crmSummary(ws) {
  const crm = Array.isArray(ws?.crmProjects) ? ws.crmProjects : [];
  const txs = Array.isArray(ws?.businessTransactions) ? ws.businessTransactions : [];
  const names = crm.map((c) => String(c?.customer || "")).filter(Boolean);
  return { crm: crm.length, txs: txs.length, names };
}

async function listSbUsers(sb) {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 200) break;
    page += 1;
  }
  return users;
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
    raw = readFileSync(abs, "utf8");
  }
  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(raw.trim())) });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("חסר Supabase");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sbUsers = await listSbUsers(sb);
  const sbByEmail = new Map(sbUsers.map((u) => [(u.email || "").toLowerCase(), u]));

  const snap = await db.collection("users").get();
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN ===");

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    let email = String(data.email || "").trim().toLowerCase();
    if (!email) {
      try {
        email = String((await auth.getUser(doc.id)).email || "").trim().toLowerCase();
      } catch {
        continue;
      }
    }
    const ws = toPlain(data.yarhiWorkspace || null);
    const fb = crmSummary(ws);
    const sbUser = sbByEmail.get(email);
    if (!sbUser) {
      console.log(`skip ${email} — אין חשבון Supabase`);
      continue;
    }
    const { data: existing } = await sb.from("workspaces").select("data").eq("user_id", sbUser.id).maybeSingle();
    const sbSum = crmSummary(existing?.data);
    const takeFb = fb.crm >= sbSum.crm;
    console.log(
      `${email}  Firebase crm=${fb.crm} txs=${fb.txs} | Supabase crm=${sbSum.crm} txs=${sbSum.txs} | ${takeFb ? "יקח Firebase" : "ישאר Supabase"}`
    );

    if (!APPLY || !takeFb || !ws) continue;
    const { error } = await sb.from("workspaces").upsert({
      user_id: sbUser.id,
      data: ws,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error(`  error ${email}: ${error.message}`);
    else console.log(`  synced ${email}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
