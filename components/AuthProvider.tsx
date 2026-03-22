"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { isAccountApprovedFromUserDoc } from "@/lib/account-approval";

type AuthContextType = {
  /** מצב Firebase או מצב לוקאלי (ללא .env) נטען */
  authReady: boolean;
  /** בעת טעינת מסמך users/{uid} אחרי התחברות */
  profileLoading: boolean;
  isLoggedIn: boolean;
  hasAcceptedTerms: boolean;
  /** אושר על ידי מנהל (Firestore accountApproved). במצב לוקאלי תמיד true */
  accountApproved: boolean;
  /** גישה מלאה לתוכנה: מחובר + תקנון + אישור מנהל */
  hasAppAccess: boolean;
  firebaseUser: User | null;
  /** רק כש-Firebase לא מוגדר – סימולציה מקומית */
  login: (opts?: { acceptedTerms?: boolean }) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function userDocHasTerms(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  return data.termsAcceptedAt != null;
}

function applyUserDoc(data: Record<string, unknown> | undefined): { terms: boolean; approved: boolean } {
  return {
    terms: userDocHasTerms(data),
    approved: isAccountApprovedFromUserDoc(data),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const useFirebase = useMemo(() => isFirebaseConfigured(), []);

  const [localLoggedIn, setLocalLoggedIn] = useState(false);
  const [localTerms, setLocalTerms] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [termsFromProfile, setTermsFromProfile] = useState(false);
  const [accountApprovedFromProfile, setAccountApprovedFromProfile] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authReady, setAuthReady] = useState(!useFirebase);

  useEffect(() => {
    if (!useFirebase) {
      setAuthReady(true);
      return;
    }

    let unsubDoc: (() => void) | undefined;
    let unsubAuth: (() => void) | undefined;
    let safetyTimer: number | undefined;

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
      setAuthReady(true);
      setProfileLoading(false);
      safetyTimer = undefined;
    }, 2000);

    void (async () => {
      try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();
        if (!auth || !db) {
          clearSafety();
          setAuthReady(true);
          return;
        }

        const applyUser = (user: User | null) => {
          unsubDoc?.();
          unsubDoc = undefined;
          setFirebaseUser(user);

          if (!user) {
            setTermsFromProfile(false);
            setAccountApprovedFromProfile(true);
            setProfileLoading(false);
            setAuthReady(true);
            clearSafety();
            return;
          }

          setProfileLoading(true);
          setAuthReady(true);
          clearSafety();

          const ref = doc(db, "users", user.uid);
          // קריאה חד-פעמית מהירה יותר ממנוי ראשון – מקצרת את מסך "טוען"
          void getDoc(ref)
            .then((snap) => {
              const d = applyUserDoc(snap.data() as Record<string, unknown> | undefined);
              setTermsFromProfile(d.terms);
              setAccountApprovedFromProfile(d.approved);
              setProfileLoading(false);
            })
            .catch((err) => {
              console.error("[Yarhi Pro] getDoc users/{uid}:", err);
              setTermsFromProfile(false);
              setAccountApprovedFromProfile(false);
              setProfileLoading(false);
            });

          unsubDoc = onSnapshot(
            ref,
            (snap) => {
              const d = applyUserDoc(snap.data() as Record<string, unknown> | undefined);
              setTermsFromProfile(d.terms);
              setAccountApprovedFromProfile(d.approved);
            },
            (err) => {
              console.error("[Yarhi Pro] שגיאת Firestore ב-users/{uid}:", err);
              setTermsFromProfile(false);
              setAccountApprovedFromProfile(false);
              setProfileLoading(false);
            }
          );
        };

        // רישום לפני authStateReady – מקצר זמן עד לעדכון ראשון (לא חוסמים על await ארוך)
        unsubAuth = onAuthStateChanged(auth, applyUser);
        await Promise.race([
          auth.authStateReady(),
          new Promise<void>((resolve) => setTimeout(resolve, 1200)),
        ]);
      } catch (e) {
        console.error("[Yarhi Pro] שגיאת אתחול Firebase:", e);
        clearSafety();
        setAuthReady(true);
        setProfileLoading(false);
      }
    })();

    return () => {
      clearSafety();
      unsubDoc?.();
      unsubAuth?.();
    };
  }, [useFirebase]);

  const login = useCallback(
    (opts?: { acceptedTerms?: boolean }) => {
      if (useFirebase) return;
      setLocalLoggedIn(true);
      setLocalTerms(!!opts?.acceptedTerms);
    },
    [useFirebase]
  );

  const logout = useCallback(async () => {
    if (useFirebase) {
      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        await signOut(auth);
      }
      return;
    }
    setLocalLoggedIn(false);
    setLocalTerms(false);
  }, [useFirebase]);

  const isLoggedIn = useFirebase ? !!firebaseUser : localLoggedIn;
  const hasAcceptedTerms = useFirebase ? termsFromProfile : localTerms;
  const accountApproved = useFirebase ? accountApprovedFromProfile : true;
  const hasAppAccess = isLoggedIn && hasAcceptedTerms && accountApproved;

  /** אם Firestore/onSnapshot לא מחזירים – לא נשארים על "טוען" לנצח */
  useEffect(() => {
    if (!useFirebase || !firebaseUser || !profileLoading) return;
    const t = window.setTimeout(() => {
      console.warn("[Yarhi Pro] טעינת פרופיל ארכה – ממשיכים (בדוק Firestore / רשת).");
      setProfileLoading(false);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [useFirebase, firebaseUser, profileLoading]);

  const value = useMemo(
    () => ({
      authReady,
      profileLoading: useFirebase ? profileLoading : false,
      isLoggedIn,
      hasAcceptedTerms,
      accountApproved,
      hasAppAccess,
      firebaseUser: useFirebase ? firebaseUser : null,
      login,
      logout,
    }),
    [
      authReady,
      profileLoading,
      useFirebase,
      isLoggedIn,
      hasAcceptedTerms,
      accountApproved,
      hasAppAccess,
      firebaseUser,
      login,
      logout,
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
