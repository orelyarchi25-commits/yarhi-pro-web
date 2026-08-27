/**
 * קווים עצמאיים — כל קו נפרד, לא מחובר לקודם
 * @typedef {{ id: string, name: string, x1: number, y1: number, angleDeg: number, length: number|null, isWall: boolean, posts: number, note: string }} Line
 */

const VB_W = 900;
const VB_H = 520;
const MIN_DRAG_CM = 10;
const NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** @type {Line[]} */
let lines = [];

/** @type {{ x1: number, y1: number, x2: number, y2: number } | null} */
let dragPreview = null;
let pointerId = null;

const els = {
  svg: document.getElementById("sketch-svg"),
  edgesBody: document.getElementById("edges-body"),
  cuttingBody: document.getElementById("cutting-body"),
  summaryGrid: document.getElementById("summary-grid"),
  statusBar: document.getElementById("status-bar"),
  projectTitle: document.getElementById("project-title"),
  pergolaType: document.getElementById("pergola-type"),
  jsonBox: document.getElementById("json-box"),
};

const ns = "http://www.w3.org/2000/svg";

function uid() {
  return `L_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function nextName() {
  return NAMES[lines.length] ?? `L${lines.length + 1}`;
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

function hasLength(line) {
  const n = Number(line.length);
  return Number.isFinite(n) && n > 0;
}

function effectiveLen(line) {
  return hasLength(line) ? Number(line.length) : 80;
}

function lineEnd(line) {
  const len = effectiveLen(line);
  const r = toRad(line.angleDeg);
  return {
    x: line.x1 + len * Math.cos(r),
    y: line.y1 + len * Math.sin(r),
  };
}

function angleFromDrag(x1, y1, x2, y2) {
  let deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return Math.round(deg * 10) / 10;
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** קנה מידה קבוע לציור: 1 ס"מ = 0.45 יחידות מסך */
const CM_SCALE = 0.45;
const ORIGIN = { x: 120, y: VB_H - 100 };

function toScreen(x, y) {
  return { x: ORIGIN.x + x * CM_SCALE, y: ORIGIN.y - y * CM_SCALE };
}

function fromScreen(sx, sy) {
  return { x: (sx - ORIGIN.x) / CM_SCALE, y: -(sy - ORIGIN.y) / CM_SCALE };
}

function getSvgPoint(evt) {
  const pt = els.svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = els.svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}

function el(tag, attrs, text) {
  const n = document.createElementNS(ns, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  if (text != null) n.textContent = text;
  return n;
}

function addLine(x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  if (d < MIN_DRAG_CM) return false;
  lines.push({
    id: uid(),
    name: nextName(),
    x1,
    y1,
    angleDeg: angleFromDrag(x1, y1, x2, y2),
    length: null,
    isWall: false,
    posts: 0,
    note: "",
  });
  return true;
}

function updateLine(id, patch) {
  lines = lines.map((l) => (l.id === id ? { ...l, ...patch } : l));
  render();
}

function removeLine(id) {
  lines = lines.filter((l) => l.id !== id);
  lines = lines.map((l, i) => ({ ...l, name: NAMES[i] ?? `L${i + 1}` }));
  render();
}

function undoLast() {
  lines = lines.slice(0, -1);
  dragPreview = null;
  render();
}

function clearAll() {
  if (lines.length && !confirm("למחוק את כל הקווים?")) return;
  lines = [];
  dragPreview = null;
  render();
}

function drawLineOnSvg(svg, line, opts = {}) {
  const len = opts.previewLen ?? effectiveLen(line);
  const r = toRad(line.angleDeg);
  const ex = line.x1 + len * Math.cos(r);
  const ey = line.y1 + len * Math.sin(r);
  const a = toScreen(line.x1, line.y1);
  const b = toScreen(ex, ey);
  const measured = hasLength(line) && !opts.isPreview;

  svg.appendChild(el("line", {
    x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    stroke: line.isWall ? "#7c3aed" : measured ? "#1e3a8a" : "#94a3b8",
    "stroke-width": line.isWall ? 5 : measured ? 4 : 3,
    "stroke-dasharray": measured ? "none" : "10 6",
    "stroke-linecap": "round",
  }));

  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ln = Math.hypot(dx, dy) || 1;
  const ox = (-dy / ln) * 18;
  const oy = (dx / ln) * 18;

  svg.appendChild(el("text", {
    x: mx + ox, y: my + oy - 10, "text-anchor": "middle",
    fill: "#1e3a8a", "font-size": 22, "font-weight": 900,
  }, line.name));

  const dim = measured ? `${line.length} ס"מ` : "?";
  svg.appendChild(el("text", {
    x: mx + ox, y: my + oy + 10, "text-anchor": "middle",
    fill: measured ? "#0f172a" : "#b45309", "font-size": 12, "font-weight": 800,
  }, dim));

  if (line.note) {
    svg.appendChild(el("text", {
      x: mx + ox, y: my + oy + 24, "text-anchor": "middle",
      fill: "#0f766e", "font-size": 10, "font-weight": 700,
    }, line.note));
  }

  for (let i = 1; i <= (line.posts || 0); i++) {
    const t = i / ((line.posts || 0) + 1);
    svg.appendChild(el("circle", {
      cx: a.x + (b.x - a.x) * t, cy: a.y + (b.y - a.y) * t,
      r: 5, fill: "#fff", stroke: "#dc2626", "stroke-width": 2,
    }));
  }

  svg.appendChild(el("circle", {
    cx: a.x, cy: a.y, r: 5, fill: "#f59e0b", stroke: "#fff", "stroke-width": 1.5,
  }));
}

function renderSvg() {
  const svg = els.svg;
  svg.innerHTML = "";

  if (!lines.length && !dragPreview) {
    svg.appendChild(el("text", {
      x: VB_W / 2, y: 36, "text-anchor": "middle", fill: "#1d4ed8",
      "font-size": 17, "font-weight": 800,
    }, "גרור קו — כל קו עצמאי, לא מחובר לקודם"));
    svg.appendChild(el("text", {
      x: VB_W / 2, y: 58, "text-anchor": "middle", fill: "#64748b",
      "font-size": 13, "font-weight": 700,
    }, "אחר כך הזן מידות בטבלה: A, B, C…"));
    return;
  }

  lines.forEach((line) => drawLineOnSvg(svg, line));

  if (dragPreview) {
    const d = dist(dragPreview.x1, dragPreview.y1, dragPreview.x2, dragPreview.y2);
    const preview = {
      id: "p", name: nextName(), x1: dragPreview.x1, y1: dragPreview.y1,
      angleDeg: angleFromDrag(dragPreview.x1, dragPreview.y1, dragPreview.x2, dragPreview.y2),
      length: null, isWall: false, posts: 0, note: "",
    };
    drawLineOnSvg(svg, preview, { previewLen: Math.max(d, MIN_DRAG_CM), isPreview: true });
    const a = toScreen(dragPreview.x1, dragPreview.y1);
    const b = toScreen(dragPreview.x2, dragPreview.y2);
    svg.appendChild(el("line", {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: "#2563eb", "stroke-width": 2, "stroke-dasharray": "6 4", opacity: 0.5,
    }));
  }
}

function renderTable() {
  if (!lines.length) {
    els.edgesBody.innerHTML = '<tr><td colspan="6" class="empty-cell">גרור קו על הסקיצה</td></tr>';
    return;
  }
  els.edgesBody.innerHTML = "";
  lines.forEach((line) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="edge-name">${line.name}</span></td>
      <td><input type="number" min="0" step="0.1" class="len-input" placeholder="מידה" value="${line.length ?? ""}" /></td>
      <td><input type="checkbox" class="wall-input" ${line.isWall ? "checked" : ""} /></td>
      <td><input type="number" min="0" class="posts-input" value="${line.posts}" style="width:64px" /></td>
      <td><input type="text" class="note-input" value="${escAttr(line.note)}" placeholder="קיר / כנף" /></td>
      <td><button type="button" class="danger del-btn" style="padding:4px 8px">מחק</button></td>
    `;
    tr.querySelector(".len-input")?.addEventListener("input", (e) => {
      const v = /** @type {HTMLInputElement} */ (e.target).value;
      updateLine(line.id, { length: v === "" ? null : parseFloat(v) || null });
    });
    tr.querySelector(".wall-input")?.addEventListener("change", (e) => {
      updateLine(line.id, { isWall: /** @type {HTMLInputElement} */ (e.target).checked });
    });
    tr.querySelector(".posts-input")?.addEventListener("input", (e) => {
      updateLine(line.id, { posts: parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10) || 0 });
    });
    tr.querySelector(".note-input")?.addEventListener("input", (e) => {
      updateLine(line.id, { note: /** @type {HTMLInputElement} */ (e.target).value });
    });
    tr.querySelector(".del-btn")?.addEventListener("click", () => removeLine(line.id));
    els.edgesBody.appendChild(tr);
  });
}

function escAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderCutting() {
  const done = lines.filter(hasLength);
  if (!done.length) {
    els.cuttingBody.innerHTML = '<tr><td colspan="4" class="empty-cell">הזן מידות בטבלה</td></tr>';
    els.summaryGrid.innerHTML = "";
    return;
  }
  els.cuttingBody.innerHTML = done.map((l) => `
    <tr>
      <td><strong>${l.name}</strong></td>
      <td><strong>${l.length}</strong></td>
      <td>${l.posts > 0 ? l.posts : "—"}</td>
      <td>${escHtml(l.note || (l.isWall ? "קיר" : "—"))}</td>
    </tr>`).join("");

  const total = done.reduce((s, l) => s + Number(l.length), 0);
  const posts = done.reduce((s, l) => s + (l.posts || 0), 0);
  els.summaryGrid.innerHTML = `
    <div class="summary-box"><div>קווים</div><div class="val">${done.length}/${lines.length}</div></div>
    <div class="summary-box"><div>סה"כ אורך</div><div class="val">${total.toFixed(1)} ס"מ</div></div>
    <div class="summary-box"><div>עמודים</div><div class="val">${posts}</div></div>
  `;
}

function renderStatus() {
  const bar = els.statusBar;
  if (!lines.length) {
    bar.className = "status-bar";
    bar.textContent = "גרור על הסקיצה — הקו הראשון ייקרא A";
    return;
  }
  const missing = lines.filter((l) => !hasLength(l)).map((l) => l.name);
  if (missing.length) {
    bar.className = "status-bar warn";
    bar.textContent = `${lines.length} קווים (${lines.map((l) => l.name).join(", ")}) — חסרות מידות: ${missing.join(", ")}`;
    return;
  }
  bar.className = "status-bar ok";
  bar.textContent = `מוכן ✓ | ${lines.map((l) => `${l.name}=${l.length}`).join(" · ")}`;
}

function getData() {
  return {
    version: 3,
    mode: "independent-lines",
    title: els.projectTitle.value.trim(),
    pergolaType: els.pergolaType?.value.trim() || "",
    lines,
    updatedAt: new Date().toISOString(),
  };
}

function loadData(data) {
  if (!Array.isArray(data?.lines)) {
    alert("JSON לא תקין");
    return;
  }
  els.projectTitle.value = data.title || "";
  if (els.pergolaType) els.pergolaType.value = data.pergolaType || "";
  lines = data.lines.map((l, i) => ({
    id: l.id || uid(),
    name: l.name || NAMES[i] || `L${i + 1}`,
    x1: Number(l.x1) || 0,
    y1: Number(l.y1) || 0,
    angleDeg: Number(l.angleDeg) || 0,
    length: l.length != null && l.length !== "" ? Number(l.length) : null,
    isWall: Boolean(l.isWall),
    posts: parseInt(String(l.posts), 10) || 0,
    note: l.note || "",
  }));
  render();
}

function render() {
  renderSvg();
  renderTable();
  renderCutting();
  renderStatus();
  els.jsonBox.value = JSON.stringify(getData(), null, 2);
}

function setupDraw() {
  const svg = els.svg;

  svg.addEventListener("pointerdown", (e) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    svg.setPointerCapture(e.pointerId);
    const sp = getSvgPoint(e);
    const l = fromScreen(sp.x, sp.y);
    dragPreview = { x1: l.x, y1: l.y, x2: l.x, y2: l.y };
    render();
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragPreview || e.pointerId !== pointerId) return;
    const sp = getSvgPoint(e);
    const l = fromScreen(sp.x, sp.y);
    dragPreview.x2 = l.x;
    dragPreview.y2 = l.y;
    renderSvg();
  });

  const end = (e) => {
    if (!dragPreview || e.pointerId !== pointerId) return;
    addLine(dragPreview.x1, dragPreview.y1, dragPreview.x2, dragPreview.y2);
    dragPreview = null;
    pointerId = null;
    try { svg.releasePointerCapture(e.pointerId); } catch { /* */ }
    render();
  };

  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", () => {
    dragPreview = null;
    pointerId = null;
    render();
  });
}

document.getElementById("btn-undo")?.addEventListener("click", undoLast);
document.getElementById("btn-clear")?.addEventListener("click", clearAll);
document.getElementById("btn-print")?.addEventListener("click", () => window.print());
document.getElementById("btn-export")?.addEventListener("click", async () => {
  const j = JSON.stringify(getData(), null, 2);
  els.jsonBox.value = j;
  try { await navigator.clipboard.writeText(j); alert("הועתק"); } catch { alert("מוכן ב-JSON"); }
});
document.getElementById("btn-import")?.addEventListener("click", () => {
  try { loadData(JSON.parse(els.jsonBox.value)); } catch { alert("JSON לא תקין"); }
});

setupDraw();
render();
