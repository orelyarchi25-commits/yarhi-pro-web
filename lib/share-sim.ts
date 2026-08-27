/** קישור הדמיה ללקוח (וואטסאפ) — בלי מחירים / בלי מסכי מערכת */

export type ShareDividerState = { led: boolean; fan: boolean };

export type ShareVitrineSide = "none" | "7000" | "9000";
export type ShareScreenColor = "black" | "grey" | "white";
export type ShareGlassType = "clear" | "antisun";

export type SharePergolaConfig = {
  L: number;
  W: number;
  gap: number;
  dividers: number;
  postsFront?: number;
  postsRight?: number;
  postsLeft?: number;
  postsBack?: number;
  hasPosts?: boolean;
  isLShape: boolean;
  lWallWidth: number;
  lWallDepth: number;
  lShapeSide: string;
  frameHex: string;
  slatHex: string;
  santafHex: string;
  hasSantaf: boolean;
  frameType: string;
  captionText: string;
  hasLed: boolean;
  hasFan: boolean;
  ledCount: number;
  fanCount: number;
  ledTone: "warm" | "white";
  dividerStates: ShareDividerState[];
  hasTensioners: boolean;
  tensionerCount: number;
  vitrineFront?: ShareVitrineSide;
  vitrineRight?: ShareVitrineSide;
  vitrineLeft?: ShareVitrineSide;
  glassType?: ShareGlassType;
  scrFront?: number;
  scrRight?: number;
  scrLeft?: number;
  screenColor?: ShareScreenColor;
  /** רקע הדמיה: וילה / מרפסת / דירת גן */
  env?: "villa" | "balcony" | "garden";
};

export function ledToneFromColor(ledColor: string): "warm" | "white" {
  return /חם|warm|צהוב/i.test(String(ledColor || "")) ? "warm" : "white";
}

/** חלוקת חציצים: מאווררים ולדים על חציצים נפרדים (לא על אותו חציץ). */
export function buildDividerAccessoryStates(opts: {
  dividers: number;
  hasLed: boolean;
  hasFan: boolean;
  ledCount: number;
  fanCount: number;
}): ShareDividerState[] {
  let fans = opts.hasFan ? Math.max(0, opts.fanCount || 0) : 0;
  if (opts.hasFan && fans <= 0) fans = 1;
  let leds = opts.hasLed ? Math.max(0, opts.ledCount || 0) : 0;
  if (opts.hasLed && leds <= 0) leds = 1;

  let n = Math.max(0, Math.min(8, opts.dividers));
  const need = fans + leds;
  if (need > 0) n = Math.min(8, Math.max(n, need));
  fans = Math.min(fans, n);
  leds = Math.min(leds, Math.max(0, n - fans));
  const len = Math.max(1, n);

  // מאווררים באמצע/ראשונים, לדים על שאר החציצים — לא על אותו חציץ
  return Array.from({ length: len }, (_, i) => {
    const isFan = i < fans;
    const isLed = !isFan && i < fans + leds;
    return { led: isLed, fan: isFan };
  });
}

/** דחיסת מצבי חציץ לפרמטר URL קצר: f=מאוורר, l=לד, -=ריק */
export function encodeDividerStatesParam(states: ShareDividerState[] | undefined): string {
  if (!Array.isArray(states) || !states.length) return "";
  return states
    .slice(0, 8)
    .map((s) => (s?.fan ? "f" : s?.led ? "l" : "-"))
    .join("");
}

export function normShareVitrineSide(v: unknown): ShareVitrineSide {
  const s = String(v ?? "none");
  return s === "7000" || s === "9000" ? s : "none";
}

export function normPergolaShareEnv(v: unknown): "villa" | "balcony" | "garden" | undefined {
  const s = String(v || "");
  if (s === "villa" || s === "balcony" || s === "garden") return s;
  return undefined;
}

export function normFenceShareEnv(v: unknown): "villa" | "garden" | undefined {
  const s = String(v || "");
  if (s === "villa" || s === "garden") return s;
  return undefined;
}

export function normFenceShareGate(v: unknown): "none" | "single" | "double" {
  const s = String(v || "");
  if (s === "single" || s === "double") return s;
  return "none";
}

export function appendPergolaShareUrlParams(params: URLSearchParams, p: SharePergolaConfig): void {
  const vf = normShareVitrineSide(p.vitrineFront);
  const vr = normShareVitrineSide(p.vitrineRight);
  const vl = normShareVitrineSide(p.vitrineLeft);
  if (vf !== "none") params.set("vf", vf);
  if (vr !== "none") params.set("vr", vr);
  if (vl !== "none") params.set("vl", vl);
  if (p.glassType && p.glassType !== "clear") params.set("gt", p.glassType);
  const sf = Math.max(0, Math.min(100, Number(p.scrFront) || 0));
  const sr = Math.max(0, Math.min(100, Number(p.scrRight) || 0));
  const sl = Math.max(0, Math.min(100, Number(p.scrLeft) || 0));
  if (sf > 0) params.set("sf", String(sf));
  if (sr > 0) params.set("sr", String(sr));
  if (sl > 0) params.set("sl", String(sl));
  if (p.screenColor && p.screenColor !== "black") params.set("sc", p.screenColor);
  if (p.env === "villa" || p.env === "balcony" || p.env === "garden") params.set("env", p.env);
  else params.set("env", "villa");
}

export type LiveSimConfig = Partial<
  Pick<
    SharePergolaConfig,
    | "postsFront"
    | "postsRight"
    | "postsLeft"
    | "postsBack"
    | "hasPosts"
    | "tensionerCount"
    | "hasTensioners"
    | "dividers"
    | "dividerStates"
    | "hasFan"
    | "fanCount"
    | "hasLed"
    | "ledCount"
    | "hasSantaf"
    | "santafHex"
    | "vitrineFront"
    | "vitrineRight"
    | "vitrineLeft"
    | "glassType"
    | "scrFront"
    | "scrRight"
    | "scrLeft"
    | "screenColor"
    | "env"
    | "frameHex"
    | "slatHex"
    | "ledTone"
  >
>;

function normalizeLiveDividerStates(raw: unknown): ShareDividerState[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.slice(0, 8).map((s) => {
    const row = s && typeof s === "object" ? (s as ShareDividerState) : { led: false, fan: false };
    const fan = !!row.fan;
    return { fan, led: !!row.led && !fan };
  });
}

export function mergePergolaShareWithLive(base: SharePergolaConfig, live: LiveSimConfig | null | undefined): SharePergolaConfig {
  if (!live) return base;
  const pf = Number(live.postsFront) || 0;
  const pr = Number(live.postsRight) || 0;
  const pl = Number(live.postsLeft) || 0;
  const pb = Number(live.postsBack) || 0;
  const total = pf + pr + pl + pb;
  const liveStates = normalizeLiveDividerStates(live.dividerStates);
  const liveFans = liveStates
    ? liveStates.some((s) => s.fan)
    : !!(live.hasFan || (Number(live.fanCount) || 0) > 0);
  const liveLeds = liveStates
    ? liveStates.some((s) => s.led)
    : !!(live.hasLed || (Number(live.ledCount) || 0) > 0);
  const liveSantaf = !!live.hasSantaf;
  const fanN = liveStates
    ? liveStates.filter((s) => s.fan).length
    : Math.max(base.hasFan || liveFans ? 1 : 0, base.fanCount || 0, Number(live.fanCount) || 0);
  const ledN = liveStates
    ? liveStates.filter((s) => s.led).length
    : Math.max(base.hasLed || liveLeds ? 1 : 0, base.ledCount || 0, Number(live.ledCount) || 0);
  const hasFan = liveStates ? fanN > 0 : base.hasFan || liveFans || fanN > 0;
  const hasLed = liveStates ? ledN > 0 : base.hasLed || liveLeds || ledN > 0;
  const hasSantaf = base.hasSantaf || liveSantaf;
  const finalFan = hasFan ? Math.max(liveStates ? fanN : 1, fanN) : 0;
  const finalLed = hasLed ? Math.max(liveStates ? ledN : 1, ledN) : 0;
  const dividers = Math.min(
    8,
    Math.max(
      base.dividers || 0,
      Number(live.dividers) || 0,
      liveStates ? liveStates.length : 0,
      finalFan + finalLed
    )
  );
  const vf = normShareVitrineSide(live.vitrineFront ?? base.vitrineFront);
  const vr = normShareVitrineSide(live.vitrineRight ?? base.vitrineRight);
  const vl = normShareVitrineSide(live.vitrineLeft ?? base.vitrineLeft);
  const sf = Math.max(base.scrFront || 0, Number(live.scrFront) || 0);
  const sr = Math.max(base.scrRight || 0, Number(live.scrRight) || 0);
  const sl = Math.max(base.scrLeft || 0, Number(live.scrLeft) || 0);
  const liveFrame = typeof live.frameHex === "string" && live.frameHex.trim() ? live.frameHex.trim() : "";
  const liveSlat = typeof live.slatHex === "string" && live.slatHex.trim() ? live.slatHex.trim() : "";
  return {
    ...base,
    ...(total > 0 || live.hasPosts
      ? { postsFront: pf, postsRight: pr, postsLeft: pl, postsBack: pb, hasPosts: true as const }
      : {}),
    hasSantaf,
    santafHex: (live.santafHex && String(live.santafHex).trim()) || base.santafHex || (hasSantaf ? "#7ec8e3" : base.santafHex),
    hasFan,
    hasLed,
    fanCount: finalFan,
    ledCount: finalLed,
    dividers: Math.max(dividers, liveStates ? liveStates.length : 0),
    dividerStates: liveStates
      ? liveStates
      : buildDividerAccessoryStates({
          dividers,
          hasLed,
          hasFan,
          ledCount: finalLed,
          fanCount: finalFan,
        }),
    ...(!base.hasTensioners && (live.hasTensioners || (Number(live.tensionerCount) || 0) > 0)
      ? { hasTensioners: true, tensionerCount: Math.max(1, Number(live.tensionerCount) || 2) }
      : {}),
    vitrineFront: vf,
    vitrineRight: vr,
    vitrineLeft: vl,
    glassType: live.glassType === "antisun" ? "antisun" : base.glassType || "clear",
    scrFront: sf,
    scrRight: sr,
    scrLeft: sl,
    screenColor:
      live.screenColor === "grey" || live.screenColor === "white"
        ? live.screenColor
        : base.screenColor || "black",
    env: normPergolaShareEnv(live.env) || base.env,
    ...(liveFrame ? { frameHex: liveFrame } : {}),
    ...(liveSlat ? { slatHex: liveSlat } : {}),
    ledTone: live.ledTone === "warm" || live.ledTone === "white" ? live.ledTone : base.ledTone,
  };
}

export function requestLiveSimConfig(win: Window | null | undefined, timeoutMs = 1500): Promise<LiveSimConfig | null> {
  if (!win || typeof window === "undefined") return Promise.resolve(null);
  const reqId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    let done = false;
    const onMsg = (ev: MessageEvent) => {
      if (!ev.data || ev.data.type !== "simConfig" || !ev.data.config) return;
      if (ev.data.reqId !== reqId) return;
      done = true;
      window.removeEventListener("message", onMsg);
      resolve(ev.data.config as LiveSimConfig);
    };
    window.addEventListener("message", onMsg);
    try {
      win.postMessage({ type: "requestSimConfig", reqId }, "*");
    } catch {
      window.removeEventListener("message", onMsg);
      resolve(null);
      return;
    }
    window.setTimeout(() => {
      if (done) return;
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, timeoutMs);
  });
}

export type ShareFenceConfig = {
  segments: { L: number; H: number; P: number; connected?: boolean; corner?: boolean; side?: "left" | "right" }[];
  gapCm: number;
  slatProfile: string;
  frameHex: string;
  slatHex: string;
  spacerHex: string;
  inGround: boolean;
  env?: "villa" | "garden";
  gate?: "none" | "single" | "double";
};

export type ShareSimPayload = {
  k: "p" | "f";
  n: string;
  p?: SharePergolaConfig;
  f?: ShareFenceConfig;
};

export function getPublicAppOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  if (typeof window === "undefined") return "https://yarhi-pro-web.vercel.app";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "https://yarhi-pro-web.vercel.app";
  }
  return window.location.origin;
}

export function encodeShareSimPayload(payload: ShareSimPayload): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeShareSimPayload(raw: string): ShareSimPayload | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = decodeURIComponent(escape(atob(padded + pad)));
    const o = JSON.parse(json) as ShareSimPayload;
    if (o?.k !== "p" && o?.k !== "f") return null;
    return o;
  } catch {
    return null;
  }
}

export function buildShareSimUrl(payload: ShareSimPayload): string {
  // Query param (not hash): WhatsApp and many messengers strip #fragments.
  return `${getPublicAppOrigin()}/share-sim?d=${encodeShareSimPayload(payload)}`;
}

export async function createShortShareUrl(payload: ShareSimPayload): Promise<string> {
  try {
    const res = await fetch("/api/share-sim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { id?: string; d?: string };
    if (data?.id) return `${getPublicAppOrigin()}/share-sim?s=${data.id}`;
    if (data?.d) return `${getPublicAppOrigin()}/share-sim?d=${data.d}`;
  } catch {
    /* fallback below */
  }
  return buildShareSimUrl(payload);
}

export function digitsToWhatsAppPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 9) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function buildSimMessage(contractorName: string, shareUrl: string): string {
  const name = contractorName.trim() || "הקבלן שלך";
  return `הדמיה מאת ${name}\n${shareUrl}`;
}

export function buildSimWhatsAppUrl(phone: string, contractorName: string, shareUrl: string): string {
  const encoded = encodeURIComponent(buildSimMessage(contractorName, shareUrl));
  const waPhone = digitsToWhatsAppPhone(phone);
  return waPhone
    ? `https://wa.me/${waPhone}?text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function openWhatsAppHref(href: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function openSimWhatsApp(
  phone: string,
  contractorName: string,
  payload: ShareSimPayload
): Promise<{ copied: boolean; shareUrl: string }> {
  const shareUrl = await createShortShareUrl(payload);
  const text = buildSimMessage(contractorName, shareUrl);
  const copied = await copyTextToClipboard(text);
  openWhatsAppHref(buildSimWhatsAppUrl(phone, contractorName, shareUrl));
  return { copied, shareUrl };
}
