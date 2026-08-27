/**
 * Floor-plan sketch from pergola dims (rectangle / L-notch).
 * Coordinates: wall along top (Y=0), depth downward (+Y).
 */

function n(v, d = 0) {
  const x = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : d;
}

function fmt(cm) {
  const v = Math.round(cm * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * Build polygon points for the pergola footprint.
 * Outer box L × W; L-notch cuts a rectangle from the front (bottom) corner.
 *
 * Convention matching calc:
 * - lengthWall = inputL (main wall segment)
 * - lWallWidth = notch width along front
 * - L = inputL + lW (total front)
 * - exitWidth = W (full depth)
 * - lWallDepth = notch depth from front
 * - side right: notch at right of front; left: notch at left
 */
export function buildFootprint(dims) {
  const inputL = n(dims.lengthWall);
  const W = n(dims.exitWidth);
  const isL = !!dims.isLShape;
  const lW = isL ? n(dims.lWallWidth) : 0;
  const lD = isL ? n(dims.lWallDepth) : 0;
  const left = (dims.lShapeSide || "right") === "left";
  const L = isL ? inputL + lW : inputL;

  if (L <= 0 || W <= 0) return { ok: false, reason: "חסרות מידות חיוביות" };
  if (isL && (lW <= 0 || lD <= 0 || lW >= L || lD >= W)) {
    return { ok: false, reason: "מגרעת לא תקינה מול המידות" };
  }

  /** @type {{x:number,y:number}[]} */
  let points;
  if (!isL) {
    points = [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: W },
      { x: 0, y: W },
    ];
  } else if (left) {
    // notch bottom-left: from front-left go up lD, right lW, down to front, across
    points = [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: W },
      { x: lW, y: W },
      { x: lW, y: W - lD },
      { x: 0, y: W - lD },
    ];
  } else {
    // notch bottom-right
    points = [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: W - lD },
      { x: L - lW, y: W - lD },
      { x: L - lW, y: W },
      { x: 0, y: W },
    ];
  }

  const edges = edgeLabels({ points, L, W, inputL, lW, lD, isL, left });
  return { ok: true, points, L, W, inputL, lW, lD, isL, left, edges };
}

function edgeLabels({ points, L, W, inputL, lW, lD, isL, left }) {
  const labels = [];
  // wall (top)
  labels.push({ a: points[0], b: points[1], text: fmt(L), role: "wall", name: "קיר / חזית כוללת" });

  if (!isL) {
    labels.push({ a: points[1], b: points[2], text: fmt(W), role: "side", name: "יציאה" });
    labels.push({ a: points[2], b: points[3], text: fmt(L), role: "front", name: "חזית" });
    labels.push({ a: points[3], b: points[0], text: fmt(W), role: "side", name: "יציאה" });
    return labels;
  }

  if (left) {
    labels.push({ a: points[1], b: points[2], text: fmt(W), role: "side", name: "יציאה מלאה" });
    labels.push({ a: points[2], b: points[3], text: fmt(inputL), role: "front", name: "קיר ראשי (חזית)" });
    labels.push({ a: points[3], b: points[4], text: fmt(lD), role: "notch", name: "עומק מגרעת" });
    labels.push({ a: points[4], b: points[5], text: fmt(lW), role: "notch", name: "רוחב מגרעת" });
    labels.push({ a: points[5], b: points[0], text: fmt(W - lD), role: "side", name: "יציאה קצרה" });
  } else {
    labels.push({ a: points[1], b: points[2], text: fmt(W - lD), role: "side", name: "יציאה קצרה" });
    labels.push({ a: points[2], b: points[3], text: fmt(lW), role: "notch", name: "רוחב מגרעת" });
    labels.push({ a: points[3], b: points[4], text: fmt(lD), role: "notch", name: "עומק מגרעת" });
    labels.push({ a: points[4], b: points[5], text: fmt(inputL), role: "front", name: "קיר ראשי (חזית)" });
    labels.push({ a: points[5], b: points[0], text: fmt(W), role: "side", name: "יציאה מלאה" });
  }
  return labels;
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function outwardNormal(a, b, cx, cy) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // flip so normal points away from centroid
  if ((mx - cx) * nx + (my - cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

function postDots(fp, count) {
  const c = Math.max(0, Math.min(12, parseInt(String(count ?? 0), 10) || 0));
  if (!c || !fp.ok) return [];
  const { L, W, isL, lW, lD, left } = fp;
  const pts = [];
  // distribute along front edge(s) excluding notch void
  if (!isL) {
    for (let i = 0; i < c; i++) {
      const t = c === 1 ? 0.5 : i / (c - 1);
      pts.push({ x: t * L, y: W });
    }
  } else if (left) {
    // front segment from x=lW to x=L
    const span = L - lW;
    for (let i = 0; i < c; i++) {
      const t = c === 1 ? 0.5 : i / (c - 1);
      pts.push({ x: lW + t * span, y: W });
    }
  } else {
    const span = L - lW;
    for (let i = 0; i < c; i++) {
      const t = c === 1 ? 0.5 : i / (c - 1);
      pts.push({ x: t * span, y: W });
    }
  }
  // also mark notch inner corner posts lightly? skip — keep simple
  void lD;
  return pts;
}

/**
 * @returns {string} SVG markup
 */
export function renderSketchSvg(dims, opts = {}) {
  const fp = buildFootprint(dims);
  const pad = 72;
  const maxW = opts.width || 560;
  const maxH = opts.height || 420;

  if (!fp.ok) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 200" role="img">
      <rect width="100%" height="100%" fill="#f7f4ef"/>
      <text x="280" y="100" text-anchor="middle" fill="#5c6b7a" font-size="16" font-family="Segoe UI, Tahoma, sans-serif">${fp.reason}</text>
    </svg>`;
  }

  const scale = Math.min((maxW - pad * 2) / fp.L, (maxH - pad * 2) / fp.W);
  const drawW = fp.L * scale + pad * 2;
  const drawH = fp.W * scale + pad * 2;

  const tx = (x) => pad + x * scale;
  const ty = (y) => pad + y * scale;

  const poly = fp.points.map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(" ");
  const cx = fp.L / 2;
  const cy = fp.W / 2;

  // wall hatch along top
  const wallY = ty(0);
  const hatch = [];
  for (let x = 0; x <= fp.L; x += Math.max(12, fp.L / 24)) {
    const X = tx(x);
    hatch.push(`<line x1="${X}" y1="${wallY - 18}" x2="${X + 10}" y2="${wallY}" stroke="#8a6820" stroke-width="1.2"/>`);
  }

  const dimLines = fp.edges
    .map((e) => {
      const { nx, ny } = outwardNormal(e.a, e.b, cx, cy);
      const off = 28;
      const a2 = { x: e.a.x + nx * (off / scale), y: e.a.y + ny * (off / scale) };
      const b2 = { x: e.b.x + nx * (off / scale), y: e.b.y + ny * (off / scale) };
      const m = mid(a2, b2);
      const labelOff = 14 / scale;
      const lx = m.x + nx * labelOff;
      const ly = m.y + ny * labelOff;
      const color = e.role === "notch" ? "#b8892d" : e.role === "wall" ? "#16345c" : "#1c2430";
      return `
        <line x1="${tx(e.a.x)}" y1="${ty(e.a.y)}" x2="${tx(a2.x)}" y2="${ty(a2.y)}" stroke="${color}" stroke-width="1" opacity="0.35"/>
        <line x1="${tx(e.b.x)}" y1="${ty(e.b.y)}" x2="${tx(b2.x)}" y2="${ty(b2.y)}" stroke="${color}" stroke-width="1" opacity="0.35"/>
        <line x1="${tx(a2.x)}" y1="${ty(a2.y)}" x2="${tx(b2.x)}" y2="${ty(b2.y)}" stroke="${color}" stroke-width="1.6"/>
        <text x="${tx(lx)}" y="${ty(ly)}" text-anchor="middle" dominant-baseline="middle"
          fill="${color}" font-size="13" font-weight="700" font-family="Segoe UI, Tahoma, sans-serif">${e.text}</text>
      `;
    })
    .join("");

  const posts = postDots(fp, dims.postCount)
    .map(
      (p) =>
        `<circle cx="${tx(p.x)}" cy="${ty(p.y)}" r="5.5" fill="#fff" stroke="#16345c" stroke-width="2"/>`
    )
    .join("");

  const title = fp.isL
    ? `צורת ר׳ · מגרעת ${fp.left ? "שמאל" : "ימין"} · ${fmt(fp.L)}×${fmt(fp.W)}`
    : `מלבן · ${fmt(fp.L)}×${fmt(fp.W)}`;

  const area = fp.isL
    ? ((fp.L * fp.W - fp.lW * fp.lD) / 10000).toFixed(2)
    : ((fp.L * fp.W) / 10000).toFixed(2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawW.toFixed(0)} ${drawH.toFixed(0)}" role="img" aria-label="סקיצת פרגולה">
    <rect width="100%" height="100%" fill="#fffcf7"/>
    <text x="${pad}" y="28" fill="#16345c" font-size="15" font-weight="800" font-family="Segoe UI, Tahoma, sans-serif">${title}</text>
    <text x="${drawW - pad}" y="28" text-anchor="end" fill="#5c6b7a" font-size="12" font-family="Segoe UI, Tahoma, sans-serif">${area} מ״ר</text>
    ${hatch.join("")}
    <text x="${tx(fp.L / 2)}" y="${wallY - 26}" text-anchor="middle" fill="#8a6820" font-size="11" font-weight="700" font-family="Segoe UI, Tahoma, sans-serif">קיר הבית</text>
    <polygon points="${poly}" fill="rgba(22,52,92,0.08)" stroke="#16345c" stroke-width="3" stroke-linejoin="round"/>
    ${dimLines}
    ${posts}
  </svg>`;
}
