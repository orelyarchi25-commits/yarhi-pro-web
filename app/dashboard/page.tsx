"use client";

import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";

const AluminumSimulator = dynamic(
  () => import("@/components/AluminumSimulator"),
  { ssr: false }
);

type TabId = "simulation" | "pergolas";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("simulation");
  const { isLoggedIn, hasAppAccess, accountBlockReason } = useAuth();

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 pt-20">
        <div className="rounded-2xl border border-metallic-700/50 bg-navy-900/50 p-12 text-center backdrop-blur">
          <h1 className="text-2xl font-bold text-white">
            Sign in to access your dashboard
          </h1>
          <p className="mt-2 text-metallic-400">
            Click <span className="font-semibold text-accent-gold">Login</span>{" "}
            in the header to simulate signing in.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-accent-gold px-6 py-3 font-bold text-navy-950 transition hover:bg-accent-gold/90"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  if (!hasAppAccess) {
    const expired = accountBlockReason === "expired";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 pt-20" dir="rtl">
        <div
          className={`max-w-lg rounded-2xl border bg-navy-900/80 p-10 text-center text-white ${
            expired ? "border-amber-600/50" : "border-sky-600/50"
          }`}
        >
          <h1 className={`text-2xl font-black ${expired ? "text-amber-300" : "text-sky-300"}`}>
            {expired ? "פג תוקף הגישה" : "החשבון ממתין לאישור"}
          </h1>
          <p className="mt-3 text-metallic-300 text-sm leading-relaxed">
            {expired
              ? "תוקף הגישה במערכת הסתיים. פנה למנהל לחידוש ולאחר מכן רענן את הדף או התחבר מחדש."
              : "אין גישה ללוח הבקרה עד שמנהל מאשר את החשבון. חזור לדף הבית או התנתק."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-accent-gold px-6 py-3 font-bold text-navy-950 transition hover:bg-accent-gold/90"
          >
            לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh pt-24" dir="rtl">
      <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-8 xl:px-10">
        {/* Dashboard Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">לוח בקרה</h1>
          <p className="mt-2 text-metallic-400">
            מחשבון אלומיניום, תמחור והדמיה תלת־ממד
          </p>
        </div>

        {/* Tabs: Simulation | Pergolas */}
        <div className="mb-6 flex gap-2 border-b border-metallic-700/50 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("simulation")}
            className={`rounded-t-xl px-6 py-3 font-bold transition ${
              activeTab === "simulation"
                ? "bg-navy-700 text-white border border-b-0 border-metallic-600"
                : "bg-navy-900/50 text-metallic-400 hover:bg-navy-800 hover:text-white"
            }`}
          >
            הדמיה
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pergolas")}
            className={`rounded-t-xl px-6 py-3 font-bold transition ${
              activeTab === "pergolas"
                ? "bg-navy-700 text-white border border-b-0 border-metallic-600"
                : "bg-navy-900/50 text-metallic-400 hover:bg-navy-800 hover:text-white"
            }`}
          >
            פרגולות
          </button>
        </div>

        {/* Simulation tab – unchanged */}
        {activeTab === "simulation" && (
          <div className="space-y-6">
            <AluminumSimulator />
            <div className="rounded-xl border border-metallic-600/50 bg-navy-950/50 p-4">
              <p className="text-sm text-metallic-400">
                <span className="font-semibold text-accent-silver">Mock Auth:</span>{" "}
                לחץ על <span className="font-mono text-accent-gold">Logout</span> בכותרת
                כדי לדמות התנתקות.
              </p>
            </div>
          </div>
        )}

        {/* Pergolas tab – full UI, calculation, cutting lists, material orders from original HTML */}
        {activeTab === "pergolas" && (
          <div className="min-h-[80vh] w-full rounded-xl overflow-hidden border border-metallic-600/50 bg-white shadow-xl">
            <iframe
              src="/app.html?view=data"
              title="פרגולות – הזנת נתונים והפקת דו&quot;חות"
              className="w-full min-h-[80vh] border-0"
              allow="fullscreen"
            />
          </div>
        )}
      </div>
    </main>
  );
}
