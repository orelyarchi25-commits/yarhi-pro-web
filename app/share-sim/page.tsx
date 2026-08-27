"use client";

import { useEffect, useState } from "react";
import {
  decodeShareSimPayload,
  encodeDividerStatesParam,
  appendPergolaShareUrlParams,
  type SharePergolaConfig,
  type ShareSimPayload,
} from "@/lib/share-sim";

const SIM_REV = "fence-zigzag-v12";

function pergolaIframeSrc(p: SharePergolaConfig): string {
  const params = new URLSearchParams();
  params.set("rev", SIM_REV);
  params.set("viewOnly", "1");
  params.set("L", String(p.L || 0));
  params.set("W", String(p.W || 0));
  params.set("gap", String(p.gap || 0));
  params.set("dividers", String(p.dividers || 0));
  params.set("postsFront", String(p.postsFront || 0));
  params.set("postsRight", String(p.postsRight || 0));
  params.set("postsLeft", String(p.postsLeft || 0));
  params.set("postsBack", String(p.postsBack || 0));
  params.set(
    "hasPosts",
    p.hasPosts || (p.postsFront || 0) + (p.postsRight || 0) + (p.postsLeft || 0) + (p.postsBack || 0) > 0
      ? "1"
      : "0"
  );
  params.set("isLShape", p.isLShape ? "1" : "0");
  params.set("lWallWidth", String(p.lWallWidth || 0));
  params.set("lWallDepth", String(p.lWallDepth || 0));
  params.set("lShapeSide", p.lShapeSide || "right");
  params.set("frameHex", p.frameHex || "");
  params.set("slatHex", p.slatHex || "");
  params.set("santafHex", p.santafHex || (p.hasSantaf ? "#7ec8e3" : ""));
  if (p.hasSantaf) params.set("hasSantaf", "1");
  params.set("frameType", p.frameType || "");
  params.set("captionText", p.captionText || "");
  if (p.hasLed) params.set("hasLed", "1");
  if (p.hasFan) params.set("hasFan", "1");
  if (p.hasLed) params.set("ledCount", String(p.ledCount || 1));
  if (p.hasFan) params.set("fanCount", String(p.fanCount || 1));
  params.set("ledTone", p.ledTone || "white");
  if (p.hasTensioners) {
    params.set("hasTensioners", "1");
    params.set("tensionerCount", String(p.tensionerCount || 2));
  }
  const ds = encodeDividerStatesParam(p.dividerStates);
  if (ds) params.set("ds", ds);
  appendPergolaShareUrlParams(params, p);
  return `/sim.html?${params.toString()}`;
}

export default function ShareSimPage() {
  const [payload, setPayload] = useState<ShareSimPayload | null | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = (params.get("s") || "").trim();
    const d = (params.get("d") || window.location.hash.replace(/^#/, "")).trim();

    if (sid) {
      void fetch(`/api/share-sim?s=${encodeURIComponent(sid)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { payload?: ShareSimPayload } | null) => {
          setPayload(data?.payload && (data.payload.k === "p" || data.payload.k === "f") ? data.payload : null);
        })
        .catch(() => setPayload(null));
      return;
    }
    setPayload(d ? decodeShareSimPayload(d) : null);
  }, []);

  const contractor = payload?.n?.trim() || "הקבלן שלך";
  const kind = payload?.k;

  useEffect(() => {
    if (!payload) return;
    const iframe = document.getElementById("share-sim-iframe") as HTMLIFrameElement | null;
    if (!iframe) return;

    const apply = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) return;
        if (payload.k === "p" && payload.p) {
          win.postMessage({ type: "applyExternalConfig", config: payload.p }, "*");
        } else if (payload.k === "f" && payload.f) {
          win.postMessage({ type: "applyExternalConfig", config: payload.f }, "*");
        }
      } catch {
        /* ignore */
      }
    };

    const timers: number[] = [];
    iframe.onload = () => {
      apply();
      timers.push(window.setTimeout(apply, 300));
      timers.push(window.setTimeout(apply, 900));
    };
    apply();
    return () => {
      iframe.onload = null;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [payload]);

  const fenceEnv = payload?.f?.env === "garden" ? "garden" : "villa";
  const src =
    kind === "f"
      ? `/fence-sim.html?viewOnly=1&rev=${SIM_REV}&env=${fenceEnv}`
      : payload?.p
        ? pergolaIframeSrc(payload.p)
        : `/sim.html?rev=${SIM_REV}&viewOnly=1&env=villa`;

  if (payload === undefined) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <p className="text-lg font-bold">טוען הדמיה…</p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <p className="text-lg font-bold">קישור ההדמיה לא תקין או פג.</p>
      </main>
    );
  }

  return (
    <main dir="rtl" className="h-dvh max-h-dvh w-full overflow-hidden bg-slate-950 flex flex-col">
      <header className="shrink-0 bg-slate-900 text-white px-4 py-3 border-b border-slate-700 text-center">
        <p className="text-[11px] text-slate-400 font-bold tracking-wide">הדמיה חיה בתלת-ממד</p>
        <h1 className="text-lg sm:text-xl font-black text-amber-300 mt-0.5">מאת {contractor}</h1>
        <p className="text-[11px] text-slate-500 mt-1">גררו כדי להסתובב · צביטה / גלגלת לזום</p>
      </header>
      <div className="min-h-0 flex-1">
        <iframe
          id="share-sim-iframe"
          title="הדמיה ללקוח"
          src={src}
          className="block h-full w-full border-0 bg-slate-900"
          style={{ touchAction: "none" }}
          referrerPolicy="no-referrer"
        />
      </div>
    </main>
  );
}
