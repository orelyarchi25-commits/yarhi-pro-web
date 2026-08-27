"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { fetchOwnProfile, getProfileAccess, signOutSupabase } from "@/lib/supabase-profile";
import { isAdminEmail } from "@/lib/admin-access";
import {
  accessValidUntilMillis,
  getAccountAccessState,
  type AccountAccessBlockReason,
} from "@/lib/account-approval";

export type CloudBackend = "supabase" | "firebase" | "local" | null;

type AuthContextType = {
  authReady: boolean;
  profileLoading: boolean;
  isLoggedIn: boolean;
  hasAcceptedTerms: boolean;
  accountApproved: boolean;
  accountBlockReason: AccountAccessBlockReason | null;
  hasAppAccess: boolean;
  isAdmin: boolean;
  /** משתמש Firebase — נשאר לפריסת Firebase קיימת */
  firebaseUser: User | null;
  /** משתמש Supabase — לקבלנים חדשים */
  supabaseUser: SupabaseAuthUser | null;
  /** מאיפה מגיעים הנתונים כרגע */
  cloudBackend: CloudBackend;
  /** uid לענן פעיל (Supabase עדיף אם מחובר) */
  cloudUserId: string | null;
  login: (opts?: { acceptedTerms?: boolean }) => void;
  logout: () => Promise<void>;
  /** טעינה מחדש של אישור/תוקף מהענן הפעיל */
  refreshAccountAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function userDocHasTerms(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  return data.termsAcceptedAt != null;
}

function applyUserDoc(data: Record<string, unknown> | undefined): {
  terms: boolean;
  approved: boolean;
  blockReason: AccountAccessBlockReason | null;
  accessUntilMillis: number | null;
} {
  const access = getAccountAccessState(data);
  return {
    terms: userDocHasTerms(data),
    approved: access.allowed,
    blockReason: access.blockReason,
    accessUntilMillis: accessValidUntilMillis(data),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const useFirebase = useMemo(() => isFirebaseConfigured(), []);
  const useSupabase = useMemo(() => isSupabaseConfigured(), []);

  const [localLoggedIn, setLocalLoggedIn] = useState(false);
  const [localTerms, setLocalTerms] = useState(false);
  const [devGhostLogin, setDevGhostLogin] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseAuthUser | null>(null);

  const [termsFromProfile, setTermsFromProfile] = useState(false);
  const [accountApprovedFromProfile, setAccountApprovedFromProfile] = useState(true);
  const [accountBlockReasonFromProfile, setAccountBlockReasonFromProfile] = useState<AccountAccessBlockReason | null>(null);
  const [accessUntilMillisFromProfile, setAccessUntilMillisFromProfile] = useState<number | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authReady, setAuthReady] = useState(!useFirebase && !useSupabase);

  /** כשיש סשן Supabase — Firebase לא דורס אישור/תקנון (באג כפול-סשן) */
  const supabaseActiveRef = useRef(false);
  const supabaseUserIdRef = useRef<string | null>(null);
  const firebaseUserRef = useRef<User | null>(null);

  /** ---- Supabase session ---- */
  useEffect(() => {
    if (!useSupabase) return;
    const sb = getSupabase();
    if (!sb) return;

    let cancelled = false;

    const applySupabaseUser = async (user: SupabaseAuthUser | null) => {
      if (cancelled) return;
      supabaseActiveRef.current = Boolean(user);
      supabaseUserIdRef.current = user?.id ?? null;
      setSupabaseUser(user);
      if (!user) {
        if (!firebaseUserRef.current) {
          setTermsFromProfile(false);
          setAccountApprovedFromProfile(true);
          setAccountBlockReasonFromProfile(null);
          setAccessUntilMillisFromProfile(null);
        }
        setProfileLoading(false);
        setAuthReady(true);
        return;
      }

      // אם מנהל Firebase מחובר — לא נותנים לסשן בדיקה של Supabase לחטוף אותו
      const fbEmail = useFirebase ? getFirebaseAuth()?.currentUser?.email : null;
      if (isAdminEmail(fbEmail) || isAdminEmail(firebaseUserRef.current?.email)) {
        supabaseActiveRef.current = false;
        supabaseUserIdRef.current = null;
        setSupabaseUser(null);
        try {
          await signOutSupabase();
        } catch {
          /* ignore */
        }
        setAuthReady(true);
        return;
      }

      setProfileLoading(true);
      setAuthReady(true);
      const profile = await fetchOwnProfile(user.id);
      if (cancelled || !supabaseActiveRef.current) return;
      const d = getProfileAccess(profile);
      setTermsFromProfile(d.terms);
      setAccountApprovedFromProfile(d.approved);
      setAccountBlockReasonFromProfile(d.blockReason);
      setAccessUntilMillisFromProfile(d.accessUntilMillis);
      setProfileLoading(false);
    };

    void sb.auth.getSession().then(({ data }) => {
      void applySupabaseUser(data.session?.user ?? null);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      void applySupabaseUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [useSupabase, useFirebase]);

  /** ---- Firebase session (לא נמחק / לא מנותק) ---- */
  useEffect(() => {
    if (!useFirebase) {
      if (!useSupabase) setAuthReady(true);
      return;
    }

    let cancelled = false;
    let unsubDoc: (() => void) | undefined;
    let unsubAuth: (() => void) | undefined;
    let safetyTimer: number | undefined;
    const isDev = process.env.NODE_ENV === "development";

    const clearSafety = () => {
      if (safetyTimer !== undefined) {
        window.clearTimeout(safetyTimer);
        safetyTimer = undefined;
      }
    };

    safetyTimer = window.setTimeout(() => {
      console.warn(
        "[Yarhi Pro] אתחול Firebase חרג מזמן קצר – ממשיכים. בדוק רשת / .env.local / Rules."
      );
      if (!cancelled) {
        setAuthReady(true);
        setProfileLoading(false);
      }
    }, 2000);

    void (async () => {
      try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();
        if (!auth || !db) {
          clearSafety();
          if (!cancelled) {
            if (isDev && !useSupabase) setDevGhostLogin(true);
            setAuthReady(true);
          }
          return;
        }

        if (isDev && !useSupabase) {
          let ghost = false;
          try {
            const res = await fetch("/api/dev/impersonate-token", { method: "POST" });
            if (res.ok) {
              const data = (await res.json()) as { customToken?: string };
              if (data.customToken) {
                try {
                  await signInWithCustomToken(auth, data.customToken);
                  console.info("[Yarhi Pro] פיתוח: התחברות אוטומטית עם המשתמש מהשרת (Custom Token).");
                } catch (e) {
                  console.warn("[Yarhi Pro] פיתוח: signInWithCustomToken נכשל:", e);
                  ghost = true;
                }
              } else {
                ghost = true;
              }
            } else {
              if (res.status === 503) {
                console.warn(
                  "[Yarhi Pro] פיתוח: אין Firebase Admin מקומי (FIREBASE_SERVICE_ACCOUNT_* ב־.env.local). ממשיכים בלי משתמש או התחבר ידנית."
                );
              }
              ghost = true;
            }
          } catch (e) {
            console.warn("[Yarhi Pro] פיתוח: /api/dev/impersonate-token:", e);
            ghost = true;
          }
          if (!cancelled && ghost) setDevGhostLogin(true);
        }

        if (cancelled) return;

        const applyUser = (user: User | null) => {
          unsubDoc?.();
          unsubDoc = undefined;
          firebaseUserRef.current = user;
          setFirebaseUser(user);

          // מנהל Firebase תמיד נשאר על Firebase — בלי ניתוק, בלי דריסה מ-Supabase
          if (user && isAdminEmail(user.email)) {
            supabaseActiveRef.current = false;
            void signOutSupabase().catch(() => undefined);
            continueFirebaseProfile(user);
            return;
          }

          // סשן קבלן Supabase פעיל — Firebase נשאר מחובר ברקע, בלי לדרוס פרופיל
          if (supabaseActiveRef.current) {
            clearSafety();
            setAuthReady(true);
            return;
          }

          const sb = getSupabase();
          if (sb) {
            void sb.auth.getSession().then(({ data }) => {
              if (data.session?.user) {
                supabaseActiveRef.current = true;
                return;
              }
              continueFirebaseProfile(user);
            });
            return;
          }
          continueFirebaseProfile(user);

          function continueFirebaseProfile(u: User | null) {
            if (supabaseActiveRef.current) return;
            if (!u) {
              setTermsFromProfile(false);
              setAccountApprovedFromProfile(true);
              setAccountBlockReasonFromProfile(null);
              setAccessUntilMillisFromProfile(null);
              setProfileLoading(false);
              setAuthReady(true);
              clearSafety();
              return;
            }

            setProfileLoading(true);
            setAuthReady(true);
            clearSafety();

            const ref = doc(db!, "users", u.uid);
            void getDoc(ref)
              .then((snap) => {
                if (supabaseActiveRef.current) return;
                const d = applyUserDoc(snap.data() as Record<string, unknown> | undefined);
                setTermsFromProfile(d.terms);
                setAccountApprovedFromProfile(d.approved);
                setAccountBlockReasonFromProfile(d.blockReason);
                setAccessUntilMillisFromProfile(d.accessUntilMillis);
                setProfileLoading(false);
              })
              .catch((err) => {
                if (supabaseActiveRef.current) return;
                console.error("[Yarhi Pro] getDoc users/{uid}:", err);
                setTermsFromProfile(false);
                setAccountApprovedFromProfile(false);
                setAccountBlockReasonFromProfile("pending");
                setAccessUntilMillisFromProfile(null);
                setProfileLoading(false);
              });

            unsubDoc = onSnapshot(
              ref,
              (snap) => {
                if (supabaseActiveRef.current) return;
                const d = applyUserDoc(snap.data() as Record<string, unknown> | undefined);
                setTermsFromProfile(d.terms);
                setAccountApprovedFromProfile(d.approved);
                setAccountBlockReasonFromProfile(d.blockReason);
              },
              (err) => {
                if (supabaseActiveRef.current) return;
                console.error("[Yarhi Pro] שגיאת Firestore ב-users/{uid}:", err);
                setTermsFromProfile(false);
                setAccountApprovedFromProfile(false);
                setAccountBlockReasonFromProfile("pending");
                setProfileLoading(false);
              }
            );
          }
        };

        unsubAuth = onAuthStateChanged(auth, applyUser);
        await Promise.race([
          auth.authStateReady(),
          new Promise<void>((resolve) => setTimeout(resolve, 1200)),
        ]);
      } catch (e) {
        console.error("[Yarhi Pro] שגיאת אתחול Firebase:", e);
        clearSafety();
        if (!cancelled) {
          if (isDev && !useSupabase) setDevGhostLogin(true);
          setAuthReady(true);
          setProfileLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearSafety();
      unsubDoc?.();
      unsubAuth?.();
    };
  }, [useFirebase, useSupabase]);

  const login = useCallback(
    (opts?: { acceptedTerms?: boolean }) => {
      if ((useFirebase || useSupabase) && !devGhostLogin) return;
      setLocalLoggedIn(true);
      setLocalTerms(!!opts?.acceptedTerms);
    },
    [useFirebase, useSupabase, devGhostLogin]
  );

  const logout = useCallback(async () => {
    if (devGhostLogin) {
      console.info("[Yarhi Pro] מצב פיתוח (ללא משתמש Firebase): אין התנתקות — בפרודקשן תתחבר כרגיל.");
      return;
    }
    supabaseActiveRef.current = false;
    supabaseUserIdRef.current = null;
    if (useSupabase) {
      await signOutSupabase();
    }
    if (useFirebase) {
      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        await signOut(auth);
      }
    }
    if (!useFirebase && !useSupabase) {
      setLocalLoggedIn(false);
      setLocalTerms(false);
    }
  }, [useFirebase, useSupabase, devGhostLogin]);

  const refreshAccountAccess = useCallback(async () => {
    if (devGhostLogin) return;
    setProfileLoading(true);
    try {
      if (supabaseActiveRef.current && supabaseUserIdRef.current) {
        const profile = await fetchOwnProfile(supabaseUserIdRef.current);
        const d = getProfileAccess(profile);
        setTermsFromProfile(d.terms);
        setAccountApprovedFromProfile(d.approved);
        setAccountBlockReasonFromProfile(d.blockReason);
        setAccessUntilMillisFromProfile(d.accessUntilMillis);
        return;
      }
      const fb = firebaseUserRef.current;
      const db = getFirebaseDb();
      if (fb && db) {
        const snap = await getDoc(doc(db, "users", fb.uid));
        const d = applyUserDoc(snap.data() as Record<string, unknown> | undefined);
        setTermsFromProfile(d.terms);
        setAccountApprovedFromProfile(d.approved);
        setAccountBlockReasonFromProfile(d.blockReason);
        setAccessUntilMillisFromProfile(d.accessUntilMillis);
      }
    } catch (e) {
      console.error("[Yarhi Pro] refreshAccountAccess:", e);
    } finally {
      setProfileLoading(false);
    }
  }, [devGhostLogin]);

  const firebaseIsAdmin = !devGhostLogin && isAdminEmail(firebaseUser?.email);
  const cloudBackend: CloudBackend = firebaseIsAdmin
    ? "firebase"
    : supabaseUser
      ? "supabase"
      : firebaseUser && useFirebase && !devGhostLogin
        ? "firebase"
        : !useFirebase && !useSupabase
          ? "local"
          : null;

  const cloudUserId = firebaseIsAdmin
    ? firebaseUser?.uid ?? null
    : supabaseUser?.id ?? (firebaseUser && !devGhostLogin ? firebaseUser.uid : null);

  const activeEmail = firebaseIsAdmin
    ? firebaseUser?.email ?? null
    : supabaseUser?.email ?? firebaseUser?.email ?? null;
  const isLoggedIn = devGhostLogin
    ? true
    : firebaseIsAdmin
      ? true
      : Boolean(supabaseUser) || (useFirebase ? !!firebaseUser : localLoggedIn);
  const useCloudProfile = firebaseIsAdmin
    ? true
    : Boolean(supabaseUser) || (useFirebase && !!firebaseUser && !supabaseUser);
  const hasAcceptedTerms = devGhostLogin ? true : useCloudProfile ? termsFromProfile : localTerms;
  const isAdmin = !devGhostLogin && isAdminEmail(activeEmail);
  const accountApproved = devGhostLogin
    ? true
    : useCloudProfile
      ? isAdmin || accountApprovedFromProfile
      : true;
  const accountBlockReason = devGhostLogin
    ? null
    : useCloudProfile
      ? isAdmin
        ? null
        : accountBlockReasonFromProfile
      : null;
  const hasAppAccess = isLoggedIn && hasAcceptedTerms && accountApproved;

  useEffect(() => {
    if (devGhostLogin || !cloudUserId || isAdmin) return;
    if (!accountApprovedFromProfile || accessUntilMillisFromProfile == null) return;
    const delay = accessUntilMillisFromProfile - Date.now();
    if (delay <= 0) return;
    const id = window.setTimeout(() => {
      setAccountApprovedFromProfile(false);
      setAccountBlockReasonFromProfile("expired");
    }, delay + 400);
    return () => window.clearTimeout(id);
  }, [devGhostLogin, cloudUserId, isAdmin, accountApprovedFromProfile, accessUntilMillisFromProfile]);

  useEffect(() => {
    if (devGhostLogin || !cloudUserId || !profileLoading) return;
    const t = window.setTimeout(() => {
      console.warn("[Yarhi Pro] טעינת פרופיל ארכה – ממשיכים.");
      setProfileLoading(false);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [devGhostLogin, cloudUserId, profileLoading]);

  const value = useMemo(
    () => ({
      authReady,
      profileLoading: Boolean(cloudUserId) && !devGhostLogin ? profileLoading : false,
      isLoggedIn,
      hasAcceptedTerms,
      accountApproved,
      accountBlockReason,
      hasAppAccess,
      isAdmin,
      firebaseUser: useFirebase && !devGhostLogin ? firebaseUser : null,
      supabaseUser,
      cloudBackend,
      cloudUserId: devGhostLogin ? null : cloudUserId,
      login,
      logout,
      refreshAccountAccess,
    }),
    [
      authReady,
      profileLoading,
      cloudUserId,
      useFirebase,
      devGhostLogin,
      isLoggedIn,
      hasAcceptedTerms,
      accountApproved,
      accountBlockReason,
      hasAppAccess,
      isAdmin,
      firebaseUser,
      supabaseUser,
      cloudBackend,
      login,
      logout,
      refreshAccountAccess,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
