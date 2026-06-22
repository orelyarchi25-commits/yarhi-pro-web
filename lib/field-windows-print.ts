import type { FieldWindowRecord } from "@/lib/field-windows";
import { totalItemsSqm } from "@/lib/field-windows";

function esc(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printFieldWindowRecord(record: FieldWindowRecord, businessName: string) {
  const rows = record.items
    .map(
      (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><b>${esc(item.location || "—")}</b><br><small>${esc(item.profile)}</small></td>
        <td style="text-align:center">${item.width}×${item.height}</td>
        <td style="text-align:center">${esc(item.sqm)}</td>
        <td style="text-align:center">${item.qty}</td>
        <td>${esc(item.glass)}</td>
        <td><small>${esc(item.components)}<br>${esc(item.tracks)} · ${esc(item.overlap)}<br>${esc(item.lockInfo)}</small></td>
        <td class="text-indigo-800"><small>${esc(item.trimDescription || "ללא הלבשות")}</small></td>
        <td>${esc(item.color || "—")}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>מידות — ${esc(record.title)}</title>
<style>
body{font-family:Assistant,system-ui,sans-serif;padding:24px;color:#0f172a}
h1{margin:0 0 4px;font-size:22px} .sub{color:#64748b;font-size:13px;margin-bottom:20px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #cbd5e1;padding:8px;text-align:right;vertical-align:top}
th{background:#1e3a8a;color:#fff}
.footer{margin-top:20px;font-size:12px;color:#475569;display:flex;justify-content:space-between}
</style></head><body>
<h1>${esc(businessName)}</h1>
<div class="sub">מידות שטח חלונות — ${esc(record.title)}</div>
${record.clientPhone ? `<p><b>טלפון:</b> ${esc(record.clientPhone)}</p>` : ""}
${record.clientAddress ? `<p><b>כתובת:</b> ${esc(record.clientAddress)}</p>` : ""}
${record.notes ? `<p style="background:#ecfdf5;border:1px solid #a7f3d0;padding:10px;border-radius:8px">${esc(record.notes)}</p>` : ""}
<table>
<thead><tr>
<th>#</th><th>מיקום / פרופיל</th><th>מידות (ס"מ)</th><th>מ"ר</th><th>כמ'</th><th>זכוכית</th><th>טכני</th><th>הלבשות</th><th>צבע</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="footer">
<span>סה"כ ${record.items.length} פריטים · ${totalItemsSqm(record.items)} מ"ר</span>
<span>עודכן: ${esc(record.updatedAt)}</span>
</div>
<script>setTimeout(function(){window.print();},400);<\/script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("הדפדפן חסם חלון הדפסה");
    return;
  }
  w.document.write(html);
  w.document.close();
}
