"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function Header() {
  const { isLoggedIn, isAdmin, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-metallic-800/50 bg-navy-950/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-white transition hover:text-accent-silver"
        >
          Yarhi <span className="text-accent-gold">Pro</span>
        </Link>

        <nav className="flex items-center gap-4">
          {isLoggedIn ? (
            <>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
                  <span aria-hidden>👑</span>
                  מנהל
                </span>
              ) : null}
              <Link
                href="/dashboard"
                className="rounded-lg px-4 py-2 text-sm font-medium text-metallic-200 transition hover:bg-metallic-800/50 hover:text-white"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-metallic-600 px-4 py-2 text-sm font-medium text-metallic-200 transition hover:border-metallic-500 hover:bg-metallic-800/50"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium text-metallic-200 transition hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-accent-gold px-5 py-2 text-sm font-bold text-navy-950 transition hover:bg-accent-gold/90 hover:shadow-lg hover:shadow-accent-gold/20"
              >
                Start Free Trial
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
