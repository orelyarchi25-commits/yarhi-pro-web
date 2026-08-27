/** Contractor signature: business name as digital signature above the line, label below */
export function buildContractorSignatureHtml(
  contractorName: string,
  esc: (s: string) => string
): string {
  const name = esc((contractorName || "").trim() || "קבלן מבצע");
  return `<div class="sig-contractor" style="width:30%;text-align:center;">
    <p style="margin:0 0 6px;font-family:'Assistant',sans-serif;font-size:24px;font-weight:700;font-style:italic;color:#1e3a8a;line-height:1.2;">${name}</p>
    <div class="sig-line" style="width:100%;box-sizing:border-box;">חתימת קבלן המבצע</div>
  </div>`;
}
