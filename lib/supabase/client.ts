"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemo } from "@/lib/env";

let client: SupabaseClient | null = null;

/** 브라우저용 싱글턴. 데모 모드면 null */
export function getBrowserSupabase(): SupabaseClient | null {
  if (isDemo) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
