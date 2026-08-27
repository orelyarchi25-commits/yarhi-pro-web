import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function resolveServiceAccountJson() {
  const env = loadEnvLocal();
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) return env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const pathFromEnv = env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";
  const abs =
    pathFromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathFromEnv)
      ? pathFromEnv
      : join(root, pathFromEnv.replace(/^\.\//, ""));
  if (!existsSync(abs)) {
    throw new Error(`Missing service account file: ${abs}`);
  }
  return readFileSync(abs, "utf8").trim();
}

// Validate JSON is a service account object
const raw = resolveServiceAccountJson();
let parsed;
try {
  parsed = JSON.parse(raw);
  if (typeof parsed === "string") parsed = JSON.parse(parsed);
} catch (e) {
  throw new Error("Local Firebase JSON is invalid: " + e.message);
}
if (!parsed || typeof parsed !== "object" || !parsed.client_email) {
  throw new Error("Local Firebase JSON missing client_email — wrong file?");
}

const value = JSON.stringify(parsed);
console.log(`OK local SA for ${parsed.client_email} (json len=${value.length})`);

const envName = "production";
spawnSync("npx", ["vercel", "env", "rm", "FIREBASE_SERVICE_ACCOUNT_JSON", envName, "-y"], {
  cwd: root,
  stdio: "ignore",
  shell: true,
});
const r = spawnSync("npx", ["vercel", "env", "add", "FIREBASE_SERVICE_ACCOUNT_JSON", envName], {
  cwd: root,
  input: value + "\n",
  encoding: "utf8",
  shell: true,
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
console.log("Pushed FIREBASE_SERVICE_ACCOUNT_JSON to production. Redeploy required.");
