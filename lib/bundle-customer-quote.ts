import type { CrmProject } from "@/app/components/BusinessView";
import { recalcBundleTotals, unitTypeEmoji, unitTypeLabel, type ProjectUnit } from "@/lib/project-bundle";
import { incVatFromExVat } from "@/lib/vat";
import { buildContractorSignatureHtml } from "@/lib/quote-signature";

export type BundleQuoteBusiness = {
  contractorName: string;
  companyId: string;
  phone: string;
  address: string;
  email: string;
  logoHtml: string;
  vatPercentLabel: string;
  deliveryDays: string;
  warrantyYears: string;
  paymentStage1: string;
  paymentStage2: string;
  paymentStage3: string;
  vitrine7000PriceSqm: number;
  vitrine9000PriceSqm: number;
  vatDecimal: number;
};

type VitrineQuoteRow = {
  widthCm: number;
  heightCm: number;
  profile: string;
  note: string;
  sqm: number;
  exVat: number;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function computeVitrineQuote(
  fs: Record<string, unknown>,
  price7000: number,
  price9000: number,
  vatDecimal: number
): { rows: VitrineQuoteRow[]; exVat: number; incVat: number } {
  if (!fs.hasVitrines) return { rows: [], exVat: 0, incVat: 0 };
  const openings = Array.isArray(fs.vitrineOpenings) ? fs.vitrineOpenings : [];
  const rows: VitrineQuoteRow[] = [];
  for (const item of openings) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const widthCm = parseFloat(String(row.widthCm ?? "")) || 0;
    const heightCm = parseFloat(String(row.heightCm ?? "")) || 0;
    if (widthCm <= 0 || heightCm <= 0) continue;
    const profile = row.profile === "9000" ? "9000" : "7000";
    const sqm = (widthCm / 100) * (heightCm / 100);
    const unitPrice = profile === "9000" ? price9000 : price7000;
    rows.push({
      widthCm,
      heightCm,
      profile,
      note: String(row.note ?? "").trim(),
      sqm,
      exVat: sqm * unitPrice,
    });
  }
  const exVat = rows.reduce((sum, r) => sum + r.exVat, 0);
  return { rows, exVat, incVat: incVatFromExVat(exVat, vatDecimal) };
}

function unitSpecSummary(unit: ProjectUnit): string {
  const fs = (unit.formState ?? {}) as Record<string, unknown>;
  if (unit.type === "pergola") {
    const lw = fs.lengthWall ?? "-";
    const ew = fs.exitWidth ?? "-";
    return `מידות פרגולה: ${lw} × ${ew} ס"מ`;
  }
  if (unit.type === "fence") {
    const segs = Array.isArray(fs.segs) ? fs.segs : [];
    const len = segs.reduce((s: number, seg: { L?: number }) => s + (Number(seg.L) || 0), 0);
    return len > 0 ? `אורך כולל: ${len} ס"מ` : "גדר — ראה מפרט";
  }
  return "מידות שטח / חלונות";
}

function unitDetailHtml(unit: ProjectUnit, business: BundleQuoteBusiness): string {
  const fs = (unit.formState ?? {}) as Record<string, unknown>;
  const baseSpec = `<div style="font-size:12px;color:#475569;margin-top:2px;">${esc(unitSpecSummary(unit))}</div>`;

  if (unit.type !== "pergola" || !fs.hasVitrines) {
    return baseSpec;
  }

  const vitrine = computeVitrineQuote(fs, business.vitrine7000PriceSqm, business.vitrine9000PriceSqm, business.vatDecimal);
  if (vitrine.rows.length === 0) {
    return `${baseSpec}<div style="font-size:12px;color:#0f766e;margin-top:6px;font-weight:700;">🪟 כולל סגירת ויטרינות</div>`;
  }

  const vitrineTableRows = vitrine.rows
    .map((row, i) => {
      const noteCell = row.note ? `<br><span style="color:#64748b;font-size:10px;">${esc(row.note)}</span>` : "";
      return `<tr>
        <td style="padding:4px 6px;border:1px solid #99f6e4;text-align:center;">${i + 1}</td>
        <td style="padding:4px 6px;border:1px solid #99f6e4;text-align:center;">${row.widthCm} × ${row.heightCm} ס"מ${noteCell}</td>
        <td style="padding:4px 6px;border:1px solid #99f6e4;text-align:center;">${row.profile}</td>
        <td style="padding:4px 6px;border:1px solid #99f6e4;text-align:center;">${row.sqm.toFixed(2)}</td>
      </tr>`;
    })
    .join("");

  const totalInc = Number(unit.sellingPriceInc) || 0;
  const canSplitPrice = vitrine.incVat > 0 && totalInc > 0;
  const pergolaInc = canSplitPrice ? Math.max(0, Math.round(totalInc - vitrine.incVat)) : 0;
  const vitrineIncRounded = Math.round(vitrine.incVat);

  const priceBreakdown = canSplitPrice
    ? `<div style="font-size:11px;color:#0f766e;margin-top:6px;font-weight:700;line-height:1.5;">
        פירוט מחיר: פרגולה <strong>₪${pergolaInc.toLocaleString("he-IL")}</strong>
        + ויטרינות <strong>₪${vitrineIncRounded.toLocaleString("he-IL")}</strong>
        = סה״כ <strong>₪${Math.round(totalInc).toLocaleString("he-IL")}</strong>
      </div>`
    : `<div style="font-size:11px;color:#0f766e;margin-top:6px;font-weight:700;">סגירת ויטרינות כלולה במחיר הכולל</div>`;

  return `${baseSpec}
    <div style="margin-top:8px;padding:8px 10px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;">
      <div style="font-size:12px;font-weight:800;color:#0f766e;margin-bottom:6px;">🪟 כולל סגירת ויטרינות (${vitrine.rows.length} פתחים)</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#f0fdfa;">
            <th style="padding:4px 6px;border:1px solid #99f6e4;">#</th>
            <th style="padding:4px 6px;border:1px solid #99f6e4;">מידות פתח</th>
            <th style="padding:4px 6px;border:1px solid #99f6e4;">פרופיל</th>
            <th style="padding:4px 6px;border:1px solid #99f6e4;">מ״ר</th>
          </tr>
        </thead>
        <tbody>${vitrineTableRows}</tbody>
      </table>
      ${priceBreakdown}
    </div>`;
}

export function buildBundleCustomerQuoteHtml(project: CrmProject, business: BundleQuoteBusiness) {
  const units = project.units ?? [];
  const totals = recalcBundleTotals(units);
  const dealInc = Math.round(Number(totals.sellingPriceInc) || 0);
  const listInc = Math.round(Number(project.quoteListPriceInc) || 0);
  const showDiscountOption = listInc > 0 && dealInc > 0 && dealInc < listInc;
  const discountSaved = showDiscountOption ? listInc - dealInc : 0;
  const bundleFs = (project.formState ?? {}) as { bundleCustomerPhone?: string; bundleCustomerAddress?: string };
  const phone = bundleFs.bundleCustomerPhone ?? "";
  const address = bundleFs.bundleCustomerAddress ?? "";
  const now = new Date();
  const dateStr = now.toLocaleDateString("he-IL");
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const rows = units
    .map((u, i) => {
      const price = Number(u.sellingPriceInc) || 0;
      return `<tr>
        <td style="padding:10px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;">${i + 1}</td>
        <td style="padding:10px;border:1px solid #cbd5e1;text-align:right;">
          <div style="font-weight:800;color:#1e3a8a;">📍 ${esc(u.label || "ללא שם")}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">${unitTypeEmoji(u.type)} ${esc(unitTypeLabel(u.type))}</div>
          ${unitDetailHtml(u, business)}
        </td>
        <td style="padding:10px;border:1px solid #cbd5e1;text-align:center;font-weight:900;color:#1e40af;white-space:nowrap;">₪${price.toLocaleString("he-IL")}</td>
      </tr>`;
    })
    .join("");

  const emptyRow =
    units.length === 0
      ? `<tr><td colspan="3" style="padding:16px;border:1px solid #cbd5e1;text-align:center;color:#64748b;">טרם נוספו מוצרים לפרויקט</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>הצעת מחיר משולבת - ${esc(project.customer)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;700;800&display=swap');
  body{font-family:'Assistant',sans-serif;padding:40px;background:#f8fafc;color:#0f172a;margin:0;}
  .print-container{max-width:900px;margin:0 auto;background:white;padding:40px;box-shadow:0 10px 25px rgba(0,0,0,0.1);border-radius:16px;border:1px solid #e2e8f0;}
  .header{border-bottom:4px solid #4f46e5;padding-bottom:20px;margin-bottom:30px;display:flex;justify-content:space-between;align-items:flex-start;}
  .title-box{background:#eef2ff;padding:15px;border-radius:12px;border:1px solid #c7d2fe;text-align:left;}
  .price-box{margin-top:30px;padding:25px;background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;display:flex;justify-content:space-between;align-items:center;}
  .terms-box{margin-top:18px;padding:16px 18px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;}
  .signatures{margin-top:60px;display:flex;justify-content:space-between;padding:0 40px;}
  .sig-line{border-top:1px solid #000;padding-top:10px;width:30%;text-align:center;font-weight:bold;}
  .no-print{margin-bottom:16px;text-align:left;}
  @media print{
    .no-print{display:none!important;}
    body{background:#fff!important;padding:0}
    .print-container{box-shadow:none;padding:0;border:none}
  }
</style></head><body>
<div class="print-container">
${business.logoHtml}
<div class="no-print">
  <button onclick="window.print()" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;font-weight:bold;border:none;cursor:pointer;">🖨️ הדפס סיכום</button>
</div>
<div class="header">
  <div>
    <h1 style="font-size:32px;font-weight:800;color:#312e81;margin:0 0 5px 0;">${esc(business.contractorName)}</h1>
    ${business.companyId ? `<p style="margin:0;font-size:14px;font-weight:bold;color:#475569;">ח.פ / עוסק מורשה: ${esc(business.companyId)}</p>` : ""}
    <div style="margin-top:10px;font-size:14px;color:#475569;">
      ${business.phone ? `<span>📞 ${esc(business.phone)}</span> &nbsp;|&nbsp; ` : ""}${business.address ? `<span>📍 ${esc(business.address)}</span> &nbsp;|&nbsp; ` : ""}${business.email ? `<span>✉️ ${esc(business.email)}</span>` : ""}
    </div>
  </div>
  <div class="title-box">
    <h2 style="font-size:20px;font-weight:bold;color:#3730a3;margin:0;">הצעת מחיר משולבת</h2>
    <p style="font-weight:bold;color:#4f46e5;margin:5px 0 0 0;">${dateStr} ${timeStr}</p>
    <p style="font-size:12px;color:#6366f1;margin:6px 0 0 0;">פרויקט עם ${units.length} מוצרים</p>
  </div>
</div>

<div style="background:#f8fafc;padding:20px;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:24px;">
  <h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0 0 8px 0;">פרטי לקוח</h3>
  <p style="margin:4px 0;"><strong>שם:</strong> ${esc(project.customer)}</p>
  <p style="margin:4px 0;"><strong>כתובת:</strong> ${esc(address || "-")}</p>
  <p style="margin:4px 0;"><strong>טלפון:</strong> ${esc(phone || "-")}</p>
</div>

<h3 style="font-size:18px;font-weight:bold;color:#1e293b;margin:0 0 12px 0;">פירוט מוצרים לפי מיקום</h3>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
  <thead style="background:#eef2ff;">
    <tr>
      <th style="padding:10px;border:1px solid #cbd5e1;width:48px;">#</th>
      <th style="padding:10px;border:1px solid #cbd5e1;text-align:right;">מיקום וסוג מוצר</th>
      <th style="padding:10px;border:1px solid #cbd5e1;width:140px;">מחיר כולל מע״מ</th>
    </tr>
  </thead>
  <tbody>${rows}${emptyRow}</tbody>
  ${
    units.length > 0
      ? `<tfoot>
    <tr style="background:#ecfdf5;">
      <td colspan="2" style="padding:12px;border:1px solid #cbd5e1;text-align:left;font-weight:900;font-size:16px;color:#065f46;">סה״כ לכל הפרויקט (כולל מע״מ)</td>
      <td style="padding:12px;border:1px solid #cbd5e1;text-align:center;font-weight:900;font-size:20px;color:#047857;">₪${dealInc.toLocaleString("he-IL")}</td>
    </tr>
  </tfoot>`
      : ""
  }
</table>

<div class="price-box">
  <div>
    <p style="margin:0;font-size:14px;color:#475569;">סכום ביניים (לפני מע״מ): <strong>₪${Math.round(totals.incomeExVat).toLocaleString("he-IL")}</strong></p>
    <p style="margin:8px 0 0 0;font-size:14px;color:#475569;">מע״מ (${esc(business.vatPercentLabel)}): <strong>₪${Math.round(totals.vatAmount).toLocaleString("he-IL")}</strong></p>
  </div>
  <div style="text-align:left;">
    ${
      showDiscountOption
        ? `<button id="btn-toggle-discount" type="button" class="no-print" style="display:inline-block;margin:0 0 10px 0;background:#b45309;color:white;padding:8px 12px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-size:13px;">🏷️ הצג הנחה ללקוח</button>
          <div id="discount-original-wrap" style="display:none;margin-bottom:8px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#94a3b8;text-decoration:line-through;">₪${listInc.toLocaleString("he-IL")}</p>
            <p style="margin:4px 0 0 0;font-size:13px;font-weight:800;color:#b45309;">מחיר אחרי הנחה</p>
          </div>`
        : ""
    }
    <p style="font-weight:bold;color:#3730a3;margin:0 0 5px 0;">סה״כ לתשלום:</p>
    <h3 style="font-size:42px;font-weight:900;color:#312e81;margin:0;">₪${dealInc.toLocaleString("he-IL")}</h3>
    ${
      showDiscountOption
        ? `<p id="discount-saved-line" style="display:none;margin:8px 0 0 0;font-size:13px;font-weight:800;color:#047857;">חיסכון ללקוח: ₪${discountSaved.toLocaleString("he-IL")}</p>`
        : ""
    }
  </div>
</div>

<div class="terms-box">
  <h4 style="margin:0 0 8px 0;font-size:16px;font-weight:800;color:#0f172a;">תנאים כלליים</h4>
  <ul style="margin:0;padding-right:18px;font-size:13px;line-height:1.55;color:#334155;">
    <li>תוקף ההצעה: 14 ימים. אספקה: עד ${esc(business.deliveryDays)} ימי עסקים לאחר מקדמה ומדידה בשטח.</li>
    <li>תנאי תשלום: ${esc(business.paymentStage1)}% מקדמה | ${esc(business.paymentStage2)}% באספקת חומרים/תחילת התקנה | ${esc(business.paymentStage3)}% בסיום העבודה.</li>
    <li>הסחורה נשארת בבעלות החברה עד לפירעון מלא של התשלום.</li>
    <li>המחיר אינו כולל: חשמל, היתרים, תשתיות/פינוי, מנוף/במה לפי צורך.</li>
    <li>אחריות: ${esc(business.warrantyYears)} שנים על טיב ההתקנה (צבע ופרזול לפי תנאי יצרן).</li>
    <li>תחילת עבודה בכפוף לאישור ההצעה ותשלום מקדמה.</li>
  </ul>
</div>

<div class="signatures">
  <div class="sig-line">חתימת לקוח</div>
  ${buildContractorSignatureHtml(business.contractorName, esc)}
</div>
</div>
<script>
(function(){
  var discOn=false;
  var bind=function(){
    var btn=document.getElementById('btn-toggle-discount');
    var orig=document.getElementById('discount-original-wrap');
    var saved=document.getElementById('discount-saved-line');
    if(!btn || !orig || btn.getAttribute('data-bound')==='1') return;
    btn.setAttribute('data-bound','1');
    btn.onclick=function(){
      discOn=!discOn;
      orig.style.display=discOn?'block':'none';
      if(saved) saved.style.display=discOn?'block':'none';
      btn.textContent=discOn?'🏷️ הסתר מחיר מקורי':'🏷️ הצג הנחה ללקוח';
    };
  };
  setTimeout(bind,0);
})();
<\/script>
</body></html>`;
}

export function getActiveBundleUnitLabel(
  bundleProjectId: number | null,
  activeUnitId: string | null,
  units: ProjectUnit[] | undefined
) {
  if (bundleProjectId == null || !activeUnitId || !units) return "";
  return units.find((u) => u.id === activeUnitId)?.label?.trim() ?? "";
}
