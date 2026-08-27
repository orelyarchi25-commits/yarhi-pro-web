import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { decodeShareSimPayload, encodeShareSimPayload, type ShareSimPayload } from "@/lib/share-sim";

export const dynamic = "force-dynamic";

const COLLECTION = "shareSims";

function makeId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function isPayload(o: unknown): o is ShareSimPayload {
  if (!o || typeof o !== "object") return false;
  const k = (o as ShareSimPayload).k;
  return k === "p" || k === "f";
}

async function savePayload(id: string, payload: ShareSimPayload): Promise<boolean> {
  if (hasFirebaseAdminCredentials()) {
    try {
      const db = getFirestore(getFirebaseAdminApp());
      await db.collection(COLLECTION).doc(id).set({
        payload,
        createdAt: Date.now(),
      });
      return true;
    } catch (err) {
      console.error("[share-sim] firestore save:", err);
    }
  }
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const { error } = await sb.from("share_sims").insert({ id, payload });
      if (!error) return true;
      console.error("[share-sim] supabase save:", error.message);
    } catch (err) {
      console.error("[share-sim] supabase save:", err);
    }
  }
  return false;
}

async function loadPayload(id: string): Promise<ShareSimPayload | null> {
  if (hasFirebaseAdminCredentials()) {
    try {
      const db = getFirestore(getFirebaseAdminApp());
      const snap = await db.collection(COLLECTION).doc(id).get();
      const data = snap.data();
      if (data && isPayload(data.payload)) return data.payload;
    } catch (err) {
      console.error("[share-sim] firestore load:", err);
    }
  }
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const { data, error } = await sb.from("share_sims").select("payload").eq("id", id).maybeSingle();
      if (!error && data && isPayload(data.payload)) return data.payload as ShareSimPayload;
    } catch (err) {
      console.error("[share-sim] supabase load:", err);
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ShareSimPayload;
    if (!isPayload(body)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const id = makeId();
    const saved = await savePayload(id, body);
    if (saved) return NextResponse.json({ id });
    return NextResponse.json({ d: encodeShareSimPayload(body) });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("s") || url.searchParams.get("id") || "").trim();
  const d = (url.searchParams.get("d") || "").trim();
  if (id) {
    const payload = await loadPayload(id);
    if (!payload) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ payload });
  }
  if (d) {
    const payload = decodeShareSimPayload(d);
    if (!payload) return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ payload });
  }
  return NextResponse.json({ error: "missing" }, { status: 400 });
}
