"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6">
      <div className="max-w-md w-full rounded-2xl bg-slate-800 border border-slate-600 p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-red-400 mb-2">אירעה שגיאה</h1>
        <p className="text-slate-300 text-sm mb-6">{error.message || "שגיאה לא צפויה"}</p>
        <button
          type="button"
          onClick={reset}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition"
        >
          נסה שוב
        </button>
      </div>
    </div>
  );
}
