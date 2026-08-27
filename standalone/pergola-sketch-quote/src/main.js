import "./style.css";
import { calcPergola } from "./calc-pergola.js";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const msg = $("msg");

let img = null;
/** @type {{x1:number,y1:number,x2:number,y2:number,value:number}[]} */
let dims = [];
let pending = null;
let url = "";

function show(id) {
  $(id).classList.remove("wrap-hidden");
}
function setMsg(t) {
  msg.textContent = t;
}

function loadFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    setMsg("בחרו קובץ תמונה.");
    return;
  }
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    img = image;
    dims = [];
    pending = null;
    show("boardWrap");
    show("tools");
    show("form");
    redraw();
    setMsg("לחצו נקודה ראשונה על הסקיצה");
  };
  image.src = url;
}

$("drop").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", () => loadFile($("file").files?.[0]));
$("drop").addEventListener("dragover", (e) => e.preventDefault());
$("drop").addEventListener("drop", (e) => {
  e.preventDefault();
  loadFile(e.dataTransfer.files?.[0]);
});

function redraw() {
  if (!img) return;
  const maxW = $("boardWrap").clientWidth || 880;
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const dpr = Math.max(1, devicePixelRatio || 1);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(img, 0, 0, w, h);

  for (const d of dims) paintLine(d.x1 * w, d.y1 * h, d.x2 * w, d.y2 * h, String(d.value));
  if (pending) {
    ctx.beginPath();
    ctx.fillStyle = "#c4922e";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.arc(pending.x * w, pending.y * h, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function paintLine(x1, y1, x2, y2, text) {
  ctx.strokeStyle = "#2f6fed";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  for (const [x, y] of [
    [x1, y1],
    [x2, y2],
  ]) {
    ctx.beginPath();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2f6fed";
    ctx.lineWidth = 3;
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  ctx.font = "bold 18px Segoe UI, Tahoma, sans-serif";
  const tw = ctx.measureText(text).width + 18;
  ctx.fillStyle = "rgba(255,252,247,0.95)";
  ctx.strokeStyle = "#2f6fed";
  ctx.lineWidth = 2;
  const bx = mx - tw / 2;
  const by = my - 36;
  ctx.fillRect(bx, by, tw, 30);
  ctx.strokeRect(bx, by, tw, 30);
  ctx.fillStyle = "#1a3a5c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, mx, my - 21);
}

function pos(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

canvas.addEventListener("click", (e) => {
  if (!img) return;
  const p = pos(e);
  if (!pending) {
    pending = p;
    setMsg("נקודה 1 ✓ — לחצו על הקצה השני");
    redraw();
    return;
  }
  const raw = prompt("מה המידה בס״מ?", "");
  if (raw == null || raw.trim() === "") {
    pending = null;
    setMsg("בוטל. לחצו נקודה ראשונה שוב");
    redraw();
    return;
  }
  const value = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) {
    pending = null;
    setMsg("מידה לא תקינה. נסו שוב");
    redraw();
    return;
  }
  dims.push({
    x1: pending.x,
    y1: pending.y,
    x2: p.x,
    y2: p.y,
    value: Math.round(value * 10) / 10,
  });
  pending = null;

  // auto-fill: largest → wall, second → depth (if empty)
  const sorted = [...dims.map((d) => d.value)].sort((a, b) => b - a);
  if (!$("lengthWall").value && sorted[0]) $("lengthWall").value = sorted[0];
  if (!$("exitWidth").value && sorted[1]) $("exitWidth").value = sorted[1];

  setMsg(`נשמר ${value} — אפשר לסמן עוד, או למלא ולחשב למטה`);
  redraw();
});

$("undoBtn").addEventListener("click", () => {
  dims.pop();
  pending = null;
  redraw();
  setMsg("בוטלה מידה אחרונה");
});
$("clearBtn").addEventListener("click", () => {
  dims = [];
  pending = null;
  redraw();
  setMsg("נוקה. לחצו נקודה ראשונה");
});

$("isLShape").addEventListener("change", () => {
  document.body.classList.toggle("l-on", $("isLShape").checked);
});

window.addEventListener("resize", () => {
  if (img) redraw();
});

$("calcBtn").addEventListener("click", () => {
  const L = parseFloat($("lengthWall").value);
  const W = parseFloat($("exitWidth").value);
  if (!L || !W) {
    setMsg("מלאו אורך קיר + יציאה לפני חישוב");
    return;
  }
  const result = calcPergola({
    lengthWall: L,
    exitWidth: W,
    isLShape: $("isLShape").checked,
    lWallWidth: $("lWallWidth").value || 0,
    lWallDepth: $("lWallDepth").value || 0,
    lShapeSide: "right",
    frameType: "doubleT",
    dividerSize: "120",
    shadingProfile: "20x40",
    spacing: 4,
    hasSantaf: false,
    hasLed: false,
    postCount: 4,
    postHeight: 280,
    postType: "100",
    colorSelect: "RAL 9016",
    shadeColorSelect: "RAL 9016",
  });

  const rows = result.cuttingRows
    .map(
      (r) =>
        `<tr><td>${r.profile}</td><td>${r.purpose}</td><td class="n">×${r.qty}</td><td class="n">${r.cutCm > 0 ? r.cutCm.toFixed(1) : "—"}</td><td class="n">${r.bar}</td></tr>`
    )
    .join("");

  $("out").innerHTML = `
    <div class="meta">${result.meta.viewDimensions} · ${result.meta.sqm.toFixed(2)} מ״ר · ${result.notes}</div>
    <table>
      <thead><tr><th>פרופיל</th><th>ייעוד</th><th>כמות</th><th>מידה</th><th>מוט</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  show("out");
  $("out").scrollIntoView({ behavior: "smooth" });
});
