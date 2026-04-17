/**
 * מחיקת .next והרצת `next dev` — ללא && (תואם PowerShell / cmd).
 */
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

try {
  rmSync(".next", { recursive: true, force: true });
} catch {
  /* ignore */
}

const r = spawnSync("npx", ["next", "dev"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
