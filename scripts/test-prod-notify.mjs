/**
 * Call production test-notify-email and print result (no secret logged).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const secret = process.env.ADMIN_APPROVE_SECRET?.trim();
if (!secret) {
  console.error("No ADMIN_APPROVE_SECRET locally");
  process.exit(1);
}

const url = "https://yarhi-pro-web.vercel.app/api/admin/test-notify-email";
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secret }),
});
const text = await res.text();
console.log("status", res.status);
console.log("body", text.slice(0, 500));
