"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui", background: "#0f172a", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, width: "100%", background: "#1e293b", border: "1px solid #475569", borderRadius: 16, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 22, color: "#f87171", marginBottom: 8 }}>אירעה שגיאה במערכת</h1>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>{error?.message || "שגיאה לא צפויה"}</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ width: "100%", background: "#2563eb", color: "#fff", fontWeight: 700, padding: "12px 24px", borderRadius: 12, border: "none", cursor: "pointer" }}
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
