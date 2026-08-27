/**
 * גיבוי CRM / הכנסות / הוצאות / הגדרות מ-Firebase ומ-Supabase לקובץ מקומי.
 *
 * שימוש (PowerShell):
 *   cd C:\Users\USER\Desktop\YarhiPro-Web
 *   node scripts/backup-workspaces.mjs
 *
 * הקובץ נשמר בתיקייה backups/ (לא עולה ל-Git).
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
    const k = m[1];
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

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

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

async function backupFirebase() {
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
    if (!existsSync(abs)) return { skipped: true, reason: "אין firebase-service-account.json" };
    raw = readFileSync(abs, "utf8");
  }

  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(raw.trim())) });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const snap = await db.collection("users").get();
  const users = [];
  for (const doc of snap.docs) {
    const data = toPlain(doc.data() || {});
    let email = String(data.email || "").trim().toLowerCase();
    if (!email) {
      try {
        email = String((await auth.getUser(doc.id)).email || "").trim().toLowerCase();
      } catch {
        /* ignore */
      }
    }
    users.push({
      firebaseUid: doc.id,
      email,
      accountApproved: data.accountApproved === true,
      accessValidUntil: data.accessValidUntil ?? null,
      yarhiWorkspace: data.yarhiWorkspace ?? null,
    });
  }
  return { skipped: false, count: users.length, users };
}

async function backupSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return { skipped: true, reason: "חסר Supabase ב-.env.local" };

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profiles, error: pErr } = await sb.from("profiles").select("*");
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  const { data: workspaces, error: wErr } = await sb.from("workspaces").select("user_id, data, updated_at");
  if (wErr) throw new Error(`workspaces: ${wErr.message}`);

  return {
    skipped: false,
    profiles: profiles || [],
    workspaces: workspaces || [],
  };
}

async function main() {
  let firebase;
  try {
    firebase = await backupFirebase();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("Firebase נדלג:", msg);
    firebase = { skipped: true, reason: `שגיאת Firebase: ${msg.slice(0, 120)}` };
  }

  let supabase;
  try {
    supabase = await backupSupabase();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("Supabase נדלג:", msg);
    supabase = { skipped: true, reason: `שגיאת Supabase: ${msg.slice(0, 120)}` };
  }

  if (firebase.skipped && supabase.skipped) {
    throw new Error(
      `אין מקור גיבוי זמין.\nFirebase: ${firebase.reason}\nSupabase: ${supabase.reason}`
    );
  }

  const payload = {
    createdAt: new Date().toISOString(),
    firebase,
    supabase,
  };

  const dir = join(root, "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `yarhi-backup-${stamp()}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  const fbN = firebase.skipped ? 0 : firebase.count;
  const sbP = supabase.skipped ? 0 : supabase.profiles.length;
  const sbW = supabase.skipped ? 0 : supabase.workspaces.length;
  console.log(`גיבוי נשמר: ${file}`);
  console.log(`Firebase: ${firebase.skipped ? firebase.reason : fbN + " קבלנים"}`);
  console.log(`Supabase: ${supabase.skipped ? supabase.reason : sbP + " פרופילים, " + sbW + " workspaces"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
