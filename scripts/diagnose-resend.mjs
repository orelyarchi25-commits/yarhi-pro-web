/**
 * Diagnose Resend notify without printing full secrets.
 * Usage: node scripts/diagnose-resend.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("No .env.local");
  process.exit(1);
}

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  if (!process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const key = (process.env.RESEND_API_KEY || process.env.RESEND_KEY || "").trim();
const toRaw = (process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || "").trim();
const from = (process.env.EMAIL_FROM || "Yarhi Pro <onboarding@resend.dev>").trim();

console.log("RESEND_API_KEY:", key ? `present len=${key.length} prefix=${key.slice(0, 6)}…` : "MISSING");
console.log("ADMIN_NOTIFY_EMAIL:", toRaw || "MISSING");
console.log("EMAIL_FROM:", from);

if (!key || !toRaw) {
  console.error("Missing env — cannot send");
  process.exit(1);
}

const { Resend } = await import("resend");
const resend = new Resend(key);
const to = toRaw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

const { data, error } = await resend.emails.send({
  from,
  to,
  subject: "בדיקת Yarhi Pro (diagnose script)",
  text: "אם אתה רואה את זה — Resend המקומי עובד.",
});

if (error) {
  console.error("RESEND_ERROR:", JSON.stringify(error, null, 2));
  process.exit(2);
}
console.log("SENT_OK id=", data?.id);
