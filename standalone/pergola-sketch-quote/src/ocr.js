/**
 * Handwriting-oriented digit OCR for pergola sketches.
 * Multi-pass: preprocess variants + several Tesseract PSM modes, then merge.
 */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function toGrayContrast(data, contrast = 1.6, bias = 0) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = (g - 128) * contrast + 128 + bias;
    g = Math.max(0, Math.min(255, g));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
}

function softThreshold(data, lo = 95, hi = 175) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i];
    const v = g >= hi ? 255 : g <= lo ? 0 : g;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

function makeCanvas(img, scale, mutate) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  mutate(imageData);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Build preprocessed canvases — handwriting likes high contrast + scale-up. */
export function buildVariants(img) {
  const scale = img.naturalWidth < 1400 ? 3.2 : img.naturalWidth < 2200 ? 2.4 : 1.8;
  return [
    makeCanvas(img, scale, (d) => {
      toGrayContrast(d, 1.85, 10);
      softThreshold(d, 100, 168);
    }),
    makeCanvas(img, scale, (d) => {
      toGrayContrast(d, 2.2, -5);
      softThreshold(d, 85, 155);
    }),
  ];
}

const NUM_RE = /\d{1,4}(?:[.,]\d{1,2})?/g;

/** Accept cm-range dimensions typical for pergolas (incl. decimals like 894.5). */
export function extractNumbersFromText(text) {
  const raw = String(text || "").match(NUM_RE) || [];
  const nums = [];
  for (const s of raw) {
    let n = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(n)) continue;
    // 8945 without decimal → likely 894.5 if in "thousands" handwriting glitch
    if (n >= 2000 && n <= 9999 && Number.isInteger(n) && n % 10 !== 0) {
      const asDecimal = n / 10;
      if (asDecimal >= 50 && asDecimal <= 1500) n = asDecimal;
    }
    if (n < 15 || n > 2500) continue;
    nums.push(Math.round(n * 10) / 10);
  }
  return uniqSort(nums);
}

function uniqSort(nums) {
  const uniq = [];
  nums.forEach((n) => {
    if (!uniq.some((u) => Math.abs(u - n) < 0.08)) uniq.push(n);
  });
  return uniq.sort((a, b) => b - a);
}

function harvestFromResult(data) {
  const bag = [];
  if (data?.text) bag.push(...extractNumbersFromText(data.text));

  const words = data?.words || [];
  for (const w of words) {
    if ((w.confidence ?? 0) < 35) continue;
    bag.push(...extractNumbersFromText(w.text || ""));
  }

  const symbols = data?.symbols || [];
  // rebuild digit runs from confident symbols
  let run = "";
  for (const s of symbols) {
    const ch = (s.text || "").trim();
    const conf = s.confidence ?? 0;
    if (conf < 30) {
      if (run) {
        bag.push(...extractNumbersFromText(run));
        run = "";
      }
      continue;
    }
    if (/^[\d.,]$/.test(ch)) run += ch;
    else {
      if (run) bag.push(...extractNumbersFromText(run));
      run = "";
    }
  }
  if (run) bag.push(...extractNumbersFromText(run));

  return bag;
}

const PSM_MODES = [11, 6]; // sparse text + uniform block

async function recognizeOnce(Tesseract, source, psm, onProgress) {
  const { data } = await Tesseract.recognize(source, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && m.progress != null && onProgress) {
        onProgress(m.progress);
      }
    },
    tessedit_char_whitelist: "0123456789.,",
    tessedit_pageseg_mode: String(psm),
    classify_bln_numeric_mode: "1",
  });
  return harvestFromResult(data);
}

/**
 * @param {string} imageUrl
 * @param {(msg: string) => void} setStatus
 * @returns {Promise<number[]>}
 */
export async function recognizeSketchNumbers(imageUrl, setStatus) {
  const Tesseract = (await import("tesseract.js")).default;
  setStatus("מכין את התמונה לזיהוי…");
  const img = await loadImage(imageUrl);
  const variants = buildVariants(img);
  const all = [];
  let step = 0;
  const total = variants.length * PSM_MODES.length;

  for (let v = 0; v < variants.length; v++) {
    for (const psm of PSM_MODES) {
      step += 1;
      setStatus(`זיהוי משופר ${step}/${total} (מצב ${psm})…`);
      try {
        const found = await recognizeOnce(Tesseract, variants[v], psm, (p) => {
          setStatus(`זיהוי משופר ${step}/${total}… ${Math.round(p * 100)}%`);
        });
        all.push(...found);
      } catch (err) {
        console.warn("OCR pass failed", psm, err);
      }
    }
  }

  // also one pass on original (sometimes cleaner photos)
  try {
    setStatus("מעבר אחרון על התמונה המקורית…");
    const found = await recognizeOnce(Tesseract, imageUrl, 11, () => {});
    all.push(...found);
  } catch {
    /* ignore */
  }

  return uniqSort(all);
}
