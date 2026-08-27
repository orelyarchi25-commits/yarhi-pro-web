import { Suspense } from "react";
import HouseFinShell from "@/components/HouseFinShell";

export default function AppPage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" className="min-h-screen grid place-items-center bg-slate-50">
          <p className="text-slate-500 text-sm">טוען...</p>
        </div>
      }
    >
      <HouseFinShell />
    </Suspense>
  );
}
