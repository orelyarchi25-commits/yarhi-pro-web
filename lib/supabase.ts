import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client — תשתית מקבילה ל-Firebase.
 * לא מחליף ולא משנה את Firebase; נטען רק ממשתני סביבה.
 */

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

let browserClient: SupabaseClient | null = null;

/** לקוח דפדפן / קליינט — anon key + RLS */
export function getSupabase(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const config = getSupabaseConfig();
  if (!config) return null;
  browserClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
