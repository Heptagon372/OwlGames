"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from "@/lib/env";

let client: SupabaseClient | null = null;

/** 브라우저용 싱글턴. Supabase 미설정이면 null */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isConfigured) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
