const TEMPLATE_LIBRARY = {
  "7000:2": {
    title: "7000 / 2 כנפיים",
    rows: [
      { sku: "3309", name: "עוגנה 2/7000", qty: 1, lengthExpr: "W - 26" },
      { sku: "3308", name: "צד 2 + קולט כנף 7000", qty: 1, lengthExpr: "W - 26" },
      { sku: "3306", name: "תחתונה 2/7000", qty: 1, lengthExpr: "H - 51" },
      { sku: "3305", name: "זוית/שובל 7000", qty: 1, lengthExpr: "H - 60" },
      { sku: "3304", name: "על/תת 7000", qty: 4, lengthExpr: "(W - 28) / 2" },
      { sku: "3303", name: "כנף צד 7000", qty: 2, lengthExpr: "H - 60" },
    ],
    glass: {
      qtyExpr: "2",
      widthExpr: "((W - 28) / 2) - 52",
      heightExpr: "(H - 60) - 88",
    },
  },
  "7000:3": {
    title: "7000 / 3 כנפיים",
    rows: [
      { sku: "3610", name: "תחתונה (39) 3/7000", qty: 1, lengthExpr: "W - 26" },
      { sku: "6213", name: "עוגנה (38) 3/7000", qty: 1, lengthExpr: "W - 26" },
      { sku: "3316", name: "צד 3/קולט כנף 7000", qty: 2, lengthExpr: "H" },
      { sku: "3304", name: "על/תת 7000", qty: 6, lengthExpr: "(W - 28) / 3" },
      { sku: "3303", name: "כנף צד 7000", qty: 2, lengthExpr: "H - 60" },
      { sku: "3305", name: "זווית/שובל 7000", qty: 2, lengthExpr: "H - 60" },
      { sku: "3358", name: "הלבשת עוגנה-36", qty: 2, lengthExpr: "H + 26" },
    ],
    glass: {
      qtyExpr: "3",
      widthExpr: "((W - 28) / 3) - 52",
      heightExpr: "(H - 60) - 88",
    },
  },
  "9000:2": {
    title: "9000 / 2 כנפיים",
    rows: [
      { sku: "4814", name: "תחתונה 2/9000", qty: 1, lengthExpr: "W - 26" },
      { sku: "3443", name: "עוגנה 2/9000", qty: 1, lengthExpr: "W - 26" },
      { sku: "3661", name: "צד 2/קולט 9000", qty: 2, lengthExpr: "H" },
      { sku: "3996", name: "על/תת רגיל 9000", qty: 4, lengthExpr: "(W - 22) / 2" },
      { sku: "3997", name: "כנף רגיל 9000", qty: 2, lengthExpr: "H - 51" },
      { sku: "3998", name: "שובל רגיל 9000", qty: 2, lengthExpr: "H - 51" },
    ],
    glass: {
      qtyExpr: "2",
      widthExpr: "((W - 22) / 2) - 62",
      heightExpr: "(H - 51) - 103",
    },
  },
  "9000:3": {
    title: "9000 / 3 כנפיים",
    rows: [
      { sku: "4814", name: "תחתונה 3/9000", qty: 1, lengthExpr: "W - 26" },
      { sku: "3446", name: "עוגנה 3/9000", qty: 1, lengthExpr: "W - 26" },
      { sku: "4570", name: "צד 3 כנף/זחל 9000", qty: 2, lengthExpr: "H" },
      { sku: "3996", name: "על/תת רגיל 9000", qty: 6, lengthExpr: "(W - 22) / 3" },
      { sku: "3997", name: "כנף רגיל 9000", qty: 2, lengthExpr: "H - 42" },
      { sku: "3998", name: "שובל רגיל 9000", qty: 4, lengthExpr: "H - 42" },
      { sku: "3358", name: "הלבשת עוגנה-36", qty: 2, lengthExpr: "H + 26" },
    ],
    glass: {
      qtyExpr: "3",
      widthExpr: "((W - 22) / 3) - 62",
      heightExpr: "(H - 42) - 103",
    },
  },
};

const DEFAULT_WEIGHT_PER_M = {
  "3303": 1.5,
  "3304": 1.5,
  "3305": 1.4,
  "3306": 1.6,
  "3308": 1.7,
  "3309": 1.7,
  "3316": 2.2,
  "3358": 0.55,
  "3443": 4.6,
  "3446": 4.9,
  "3610": 1.9,
  "3661": 2.8,
  "3996": 5.6,
  "3997": 2.25,
  "3998": 1.95,
  "4570": 2.85,
  "4814": 1.15,
  "6213": 1.6,
};

const openingsListEl = document.getElementById("openings-list");
const addOpeningBtn = document.getElementById("add-opening-btn");
const calcBtn = document.getElementById("calc-btn");
const openingTemplate = document.getElementById("opening-template");
const perOpeningOutputEl = document.getElementById("per-opening-output");
const aggregateOutputEl = document.getElementById("aggregate-output");
const weightsEditor7000El = document.getElementById("weights-editor-7000");
const weightsEditor9000El = document.getElementById("weights-editor-9000");

const weightPerMeterBySku = { ...DEFAULT_WEIGHT_PER_M };

function evaluateExpression(expr, vars) {
  const fn = new Function("W", "H", "N", `return (${expr});`);
  const value = Number(fn(vars.W, vars.H, vars.N));
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function toFixedWeight(value) {
  return Number(value.toFixed(2));
}

function addOpening(initial = { series: "9000", wings: "2", width: "", height: "" }) {
  const node = openingTemplate.content.cloneNode(true);
  const wrapper = node.querySelector(".opening-item");
  const title = node.querySelector(".opening-title");
  const removeBtn = node.querySelector(".remove-btn");
  const seriesInput = node.querySelector(".series-input");
  const wingsInput = node.querySelector(".wings-input");
  const widthInput = node.querySelector(".width-input");
  const heightInput = node.querySelector(".height-input");

  seriesInput.value = initial.series;
  wingsInput.value = initial.wings;
  widthInput.value = initial.width;
  heightInput.value = initial.height;

  removeBtn.addEventListener("click", () => {
    wrapper.remove();
    renumberOpenings();
  });

  openingsListEl.appendChild(node);
  renumberOpenings();
}

function renumberOpenings() {
  openingsListEl.querySelectorAll(".opening-item").forEach((item, idx) => {
    item.querySelector(".opening-title").textContent = `פתח ${idx + 1}`;
  });
}

function collectOpenings() {
  return [...openingsListEl.querySelectorAll(".opening-item")].map((item) => ({
    series: item.querySelector(".series-input").value,
    wings: item.querySelector(".wings-input").value,
    width: Number(item.querySelector(".width-input").value),
    height: Number(item.querySelector(".height-input").value),
  }));
}

function renderError(el, message) {
  el.innerHTML = `<p class="error">${message}</p>`;
}

function renderOpeningResult(index, opening, template, rows, glass) {
  const totalWeight = toFixedWeight(rows.reduce((sum, r) => sum + r.rowWeight, 0));
  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${r.sku}</td>
        <td>${r.name}</td>
        <td>${r.qty}</td>
        <td>${r.length}</td>
        <td>${r.kgPerMeter.toFixed(2)}</td>
        <td>${r.rowWeight.toFixed(2)}</td>
        <td>${r.stockLength}</td>
      </tr>
    `
    )
    .join("");

  return `
    <article class="opening-item">
      <h3>פתח ${index + 1} - ${template.title}</h3>
      <p class="hint">מידות: ${opening.width} x ${opening.height} מ"מ</p>
      <table>
        <thead>
          <tr>
            <th>מק"ט</th>
            <th>תיאור</th>
            <th>כמות</th>
            <th>אורך חיתוך (מ"מ)</th>
            <th>ק"ג/מ'</th>
            <th>משקל שורה (ק"ג)</th>
            <th>אורך מוט</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p class="hint">זכוכית: ${glass.qty} יחידות, מידה ${glass.width} x ${glass.height} מ"מ</p>
      <p class="hint"><strong>סה"כ משקל לפתח:</strong> ${totalWeight} ק"ג</p>
    </article>
  `;
}

function aggregateRows(allRows) {
  const map = new Map();
  allRows.forEach((row) => {
    const key = `${row.sku}__${row.length}`;
    const current = map.get(key) ?? { ...row, qty: 0 };
    current.qty += row.qty;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

function renderAggregate(rows) {
  if (!rows.length) {
    aggregateOutputEl.innerHTML = '<p class="hint">אין נתונים להצגה.</p>';
    return;
  }
  const html = rows
    .map(
      (r) => `
      <tr>
        <td>${r.sku}</td>
        <td>${r.name}</td>
        <td>${r.qty}</td>
        <td>${r.length}</td>
        <td>${r.kgPerMeter.toFixed(2)}</td>
        <td>${r.rowWeight.toFixed(2)}</td>
        <td>${r.stockLength}</td>
      </tr>
    `
    )
    .join("");
  const totalWeight = toFixedWeight(rows.reduce((sum, row) => sum + row.rowWeight, 0));
  aggregateOutputEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>מק"ט</th>
          <th>תיאור</th>
          <th>כמות כוללת</th>
          <th>אורך חיתוך (מ"מ)</th>
          <th>ק"ג/מ'</th>
          <th>משקל שורה (ק"ג)</th>
          <th>אורך מוט</th>
        </tr>
      </thead>
      <tbody>${html}</tbody>
    </table>
    <p class="hint"><strong>סה"כ משקל פרויקט:</strong> ${totalWeight} ק"ג</p>
  `;
}

function renderWeightsEditor() {
  const collectSkusForSeries = (seriesPrefix) =>
    [...new Set(Object.entries(TEMPLATE_LIBRARY)
      .filter(([key]) => key.startsWith(`${seriesPrefix}:`))
      .flatMap(([, template]) => template.rows.map((row) => row.sku)))]
      .sort((a, b) => Number(a) - Number(b));

  const renderSeriesTable = (seriesSkus) => {
    const rowsHtml = seriesSkus
      .map(
        (sku) => `
      <tr>
        <td>${sku}</td>
        <td>
          <input
            type="number"
            class="weight-input"
            data-sku="${sku}"
            min="0"
            step="0.01"
            value="${weightPerMeterBySku[sku] ?? 0}"
          />
        </td>
      </tr>
    `
      )
      .join("");
    return `
      <table>
        <thead>
          <tr>
            <th>מק"ט</th>
            <th>ק"ג/מ'</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  };

  weightsEditor7000El.innerHTML = renderSeriesTable(collectSkusForSeries("7000"));
  weightsEditor9000El.innerHTML = renderSeriesTable(collectSkusForSeries("9000"));

  document.querySelectorAll(".weight-input").forEach((input) => {
    input.addEventListener("input", () => {
      const sku = input.getAttribute("data-sku");
      const value = Number(input.value);
      if (!sku) return;
      const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
      weightPerMeterBySku[sku] = safeValue;
      document.querySelectorAll(`.weight-input[data-sku="${sku}"]`).forEach((peer) => {
        if (peer !== input) peer.value = String(safeValue);
      });
    });
  });
}

function calculate() {
  const openings = collectOpenings();
  if (!openings.length) {
    renderError(perOpeningOutputEl, "צריך לפחות פתח אחד.");
    renderError(aggregateOutputEl, "צריך לפחות פתח אחד.");
    return;
  }

  const perOpeningHtml = [];
  const aggregateRowsInput = [];
  const errors = [];

  openings.forEach((opening, idx) => {
    if (!opening.width || !opening.height || opening.width <= 0 || opening.height <= 0) {
      errors.push(`פתח ${idx + 1}: חובה להזין רוחב וגובה תקינים.`);
      return;
    }

    const key = `${opening.series}:${opening.wings}`;
    const template = TEMPLATE_LIBRARY[key];
    if (!template) {
      errors.push(`פתח ${idx + 1}: אין תבנית חישוב עבור ${key}.`);
      return;
    }

    const vars = {
      W: opening.width,
      H: opening.height,
      N: Number(opening.wings),
    };

    const rows = template.rows.map((row) => ({
      sku: row.sku,
      name: row.name,
      qty: row.qty,
      length: evaluateExpression(row.lengthExpr, vars),
      kgPerMeter: Number(weightPerMeterBySku[row.sku] || 0),
      rowWeight: 0,
      stockLength: 6000,
    }));
    rows.forEach((row) => {
      row.rowWeight = toFixedWeight((row.length / 1000) * row.qty * row.kgPerMeter);
    });

    rows.forEach((r) => aggregateRowsInput.push({ ...r }));

    const glass = {
      qty: evaluateExpression(template.glass.qtyExpr, vars),
      width: evaluateExpression(template.glass.widthExpr, vars),
      height: evaluateExpression(template.glass.heightExpr, vars),
    };

    perOpeningHtml.push(renderOpeningResult(idx, opening, template, rows, glass));
  });

  if (errors.length) {
    renderError(perOpeningOutputEl, errors.join("<br/>"));
    renderError(aggregateOutputEl, "לא ניתן לחשב סיכום עד שכל השגיאות יתוקנו.");
    return;
  }

  perOpeningOutputEl.innerHTML = perOpeningHtml.join("");
  renderAggregate(aggregateRows(aggregateRowsInput));
}

addOpening();
renderWeightsEditor();

addOpeningBtn.addEventListener("click", () => addOpening());
calcBtn.addEventListener("click", calculate);
