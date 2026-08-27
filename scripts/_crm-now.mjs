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

function names(crm) {
  return (Array.isArray(crm) ? crm : []).map((c) => c?.customer || "");
}

const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const pathFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || "./firebase-service-account.json";
const abs = /^[A-Za-z]:/.test(pathFromEnv) ? pathFromEnv : join(root, pathFromEnv.replace(/^\.\//, ""));
const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(readFileSync(abs, "utf8"))) });
const db = getFirestore(app);
const auth = getAuth(app);

const snap = await db.collection("users").get();
console.log("=== FIREBASE ===");
for (const doc of snap.docs) {
  let email = String(doc.data()?.email || "");
  if (!email) {
    try {
      email = (await auth.getUser(doc.id)).email || "";
    } catch {}
  }
  const ws = doc.data()?.yarhiWorkspace || {};
  const n = names(ws.crmProjects);
  if (n.length || /yarchi|liran/i.test(email)) {
    console.log(email, "crm", n.length, "saved", ws.cloudSavedAt || "-", "names:", n.join(" | "));
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: workspaces } = await sb.from("workspaces").select("user_id, updated_at, data");
const { data: profiles } = await sb.from("profiles").select("id, email");
const emailById = new Map((profiles || []).map((p) => [p.id, p.email]));
console.log("=== SUPABASE ===");
for (const w of workspaces || []) {
  const email = emailById.get(w.user_id) || w.user_id;
  const n = names(w.data?.crmProjects);
  if (n.length || /yarchi|liran/i.test(String(email))) {
    console.log(email, "crm", n.length, "updated", w.updated_at, "saved", w.data?.cloudSavedAt || "-", "names:", n.join(" | "));
  }
}
