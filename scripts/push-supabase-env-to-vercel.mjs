import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const raw = readFileSync(envPath, "utf8");
function get(key) {
  const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const keys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_APPROVE_SECRET",
];

const targets = process.argv.slice(2);
const envs = targets.length ? targets : ["production"];

let failed = 0;
for (const key of keys) {
  const value = get(key);
  if (!value) {
    console.error(`MISSING locally: ${key}`);
    process.exit(1);
  }
  console.log(`Pushing ${key} (len=${value.length})…`);
  for (const envName of envs) {
    spawnSync("npx", ["vercel", "env", "rm", key, envName, "-y"], {
      cwd: root,
      stdio: "ignore",
      shell: true,
    });
    const r = spawnSync("npx", ["vercel", "env", "add", key, envName], {
      cwd: root,
      input: value + "\n",
      encoding: "utf8",
      shell: true,
    });
    if (r.status !== 0) {
      console.error(`Failed ${key} ${envName}:`, (r.stderr || r.stdout || "").slice(0, 500));
      failed += 1;
    } else {
      console.log(`  ok ${envName}`);
    }
  }
}

if (failed) {
  console.error(`Done with ${failed} failures.`);
  process.exit(1);
}
console.log("Done.");
