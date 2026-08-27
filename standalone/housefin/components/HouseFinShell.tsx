"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HouseFinApp from "./HouseFinApp.jsx";
import { createClient } from "@/lib/supabase/client";

type WorkspacePayload = {
  data: Record<string, unknown>;
  isPremium: boolean;
  email?: string;
};

export default function HouseFinShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/workspace", { credentials: "include" });
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (!res.ok) {
      setError("לא הצלחנו לטעון את הנתונים");
      return;
    }
    const json = (await res.json()) as WorkspacePayload;
    setPayload(json);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      void load();
    }
  }, [searchParams, load]);

  const persist = useCallback(async (data: Record<string, unknown>) => {
    await fetch("/api/workspace", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  }, []);

  const upgrade = useCallback(async () => {
    const res = await fetch("/api/stripe/checkout", { method: "POST", credentials: "include" });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
  }, []);

  const manageBilling = useCallback(async () => {
    const res = await fetch("/api/stripe/portal", { method: "POST", credentials: "include" });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  if (error) {
    return (
      <div dir="rtl" className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <p className="text-slate-600">{error}</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div dir="rtl" className="min-h-screen grid place-items-center bg-slate-50">
        <p className="text-slate-500 text-sm">טוען את הארנק המשפחתי...</p>
      </div>
    );
  }

  return (
    <HouseFinApp
      isPremium={payload.isPremium}
      userEmail={payload.email || ""}
      initialData={payload.data}
      onPersist={persist}
      onUpgrade={upgrade}
      onManageBilling={manageBilling}
      onSignOut={signOut}
    />
  );
}
