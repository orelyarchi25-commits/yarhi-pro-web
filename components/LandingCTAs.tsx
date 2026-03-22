"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { useRouter } from "next/navigation";

export function LandingCTAs() {
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = () => {
    login();
    router.push("/dashboard");
  };

  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
      <button
        onClick={handleLogin}
        className="w-full rounded-xl bg-accent-gold px-8 py-4 text-center text-base font-bold text-navy-950 shadow-lg shadow-accent-gold/25 transition hover:bg-accent-gold/90 hover:shadow-xl hover:shadow-accent-gold/30 sm:w-auto"
      >
        Start Free Trial
      </button>
      <button
        onClick={handleLogin}
        className="w-full rounded-xl border border-metallic-500 px-8 py-4 text-center text-base font-semibold text-metallic-200 transition hover:border-metallic-400 hover:bg-metallic-800/30 sm:w-auto"
      >
        Login
      </button>
    </div>
  );
}
