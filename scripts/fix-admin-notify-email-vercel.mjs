import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const raw = readFileSync(envPath, "utf8");
function get(key) {
  const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

// Force notify to the Resend account owner email (testing restriction)
const value = get("ADMIN_NOTIFY_EMAIL") || "yarhipro@gmail.com";
console.log("Setting ADMIN_NOTIFY_EMAIL on production to:", value);

spawnSync("npx", ["vercel", "env", "rm", "ADMIN_NOTIFY_EMAIL", "production", "-y"], {
  cwd: root,
  stdio: "ignore",
  shell: true,
});
const r = spawnSync("npx", ["vercel", "env", "add", "ADMIN_NOTIFY_EMAIL", "production"], {
  cwd: root,
  input: value + "\n",
  encoding: "utf8",
  shell: true,
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
console.log("OK — redeploy required");
