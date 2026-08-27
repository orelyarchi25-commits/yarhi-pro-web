/**
 * One-shot: approve contractor in Firebase Firestore (local admin credentials).
 * Usage: node scripts/approve-firebase-user.mjs email@example.com
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local into process.env
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/approve-firebase-user.mjs email@x.com");
  process.exit(1);
}

const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getFirebaseAdminApp } = require("../lib/firebase-admin.ts");

async function main() {
  // Use dynamic import of compiled isn't available — call admin directly
  const { existsSync: ex, readFileSync: rf } = await import("fs");
  const { join: j } = await import("path");
  const { cert, getApps, initializeApp } = require("firebase-admin/app");

  let app;
  if (getApps().length) {
    app = getApps()[0];
  } else {
    const jsonFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    const pathFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
    let raw;
    if (jsonFromEnv) raw = jsonFromEnv;
    else if (pathFromEnv) {
      const abs = pathFromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathFromEnv)
        ? pathFromEnv
        : j(root, pathFromEnv.replace(/^\.\//, ""));
      raw = rf(abs, "utf8");
    } else {
      throw new Error("No FIREBASE_SERVICE_ACCOUNT_* in .env.local");
    }
    app = initializeApp({ credential: cert(JSON.parse(raw.trim())) });
  }

  const auth = getAuth(app);
  const db = getFirestore(app);
  const user = await auth.getUserByEmail(email);
  const until = new Date();
  until.setMonth(until.getMonth() + 1);
  await db.doc(`users/${user.uid}`).set(
    {
      email,
      accountApproved: true,
      accessValidUntil: Timestamp.fromDate(until),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`Approved Firebase user ${email} uid=${user.uid} until ${until.toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
