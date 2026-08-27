/**
 * שחזור כל נתוני הקבלנים מגיבוי JSON (yarhi-backup-....json).
 *
 * סימולציה (לא משנה כלום):
 *   node scripts/restore-workspaces.mjs
 *
 * שחזור אמיתי:
 *   node scripts/restore-workspaces.mjs --apply
 *
 * קובץ ספציפי:
 *   node scripts/restore-workspaces.mjs --apply --file="C:\path\to\yarhi-backup-....json"
 *
 * חשוב: להשתמש ב-JSON מ-backup-workspaces.mjs — לא ב-CSV הקריא / לא ב-HTML.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

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
const fileArg = process.argv.find((a) => a.startsWith("--file="));

function latestBackupFile() {
  const dir = join(root, "backups");
  if (!existsSync(dir)) throw new Error("אין תיקיית backups");
  const files = readdirSync(dir)
    .filter((n) => n.startsWith("yarhi-backup-") && n.endsWith(".json"))
    .map((n) => ({ n, t: join(dir, n) }))
    .sort((a, b) => a.n.localeCompare(b.n));
  if (!files.length) {
    throw new Error("לא נמצא yarhi-backup-....json בתיקיית backups. קודם הרץ: node scripts/backup-workspaces.mjs");
  }
  return files[files.length - 1].t;
}

function summarizeData(data) {
  if (!data || typeof data !== "object") return { crm: 0, txs: 0 };
  return {
    crm: Array.isArray(data.crmProjects) ? data.crmProjects.length : 0,
    txs: Array.isArray(data.businessTransactions) ? data.businessTransactions.length : 0,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) throw new Error("חסר Supabase ב-.env.local");

  const file = fileArg ? fileArg.slice("--file=".length).replace(/^["']|["']$/g, "") : latestBackupFile();
  if (!existsSync(file)) throw new Error(`הקובץ לא נמצא: ${file}`);

  const payload = JSON.parse(readFileSync(file, "utf8"));
  const profiles = payload?.supabase?.profiles;
  const workspaces = payload?.supabase?.workspaces;
  if (!Array.isArray(workspaces)) {
    throw new Error("זה לא קובץ גיבוי JSON מלא (חסר supabase.workspaces). צריך yarhi-backup-....json");
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(APPLY ? "=== APPLY — שחזור אמיתי ===" : "=== DRY RUN — לא נשמר כלום ===");
  console.log(`קובץ: ${file}`);
  console.log(`נוצר: ${payload.createdAt || "?"}`);
  console.log(`פרופילים בגיבוי: ${Array.isArray(profiles) ? profiles.length : 0}`);
  console.log(`workspaces בגיבוי: ${workspaces.length}`);

  if (!APPLY) {
    for (const w of workspaces) {
      const s = summarizeData(w.data);
      console.log(`  user ${w.user_id}  crm=${s.crm} txs=${s.txs}`);
    }
    console.log("\nכדי לשחזר באמת:");
    console.log('  node scripts/restore-workspaces.mjs --apply');
    return;
  }

  let okP = 0;
  let okW = 0;

  if (Array.isArray(profiles)) {
    for (const p of profiles) {
      if (!p?.id) continue;
      const { error } = await sb.from("profiles").upsert(p, { onConflict: "id" });
      if (error) {
        console.error(`profile ${p.email || p.id}: ${error.message}`);
      } else {
        okP += 1;
      }
    }
  }

  for (const w of workspaces) {
    if (!w?.user_id) continue;
    const { error } = await sb.from("workspaces").upsert(
      {
        user_id: w.user_id,
        data: w.data ?? {},
        updated_at: w.updated_at || new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      console.error(`workspace ${w.user_id}: ${error.message}`);
    } else {
      okW += 1;
      const s = summarizeData(w.data);
      console.log(`שוחזר ${w.user_id}  crm=${s.crm} txs=${s.txs}`);
    }
  }

  console.log(`\nסיכום: ${okP} פרופילים, ${okW} workspaces`);
  console.log("הקבלנים צריכים לרענן את האתר / להתחבר מחדש.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
