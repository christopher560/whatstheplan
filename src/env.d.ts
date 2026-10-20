/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** A Supabase client that reads and writes this request's session cookies. */
    supabase: import("@supabase/supabase-js").SupabaseClient;
    /** The signed-in person, checked with Supabase on every request, or null. */
    user: import("@supabase/supabase-js").User | null;
    /** Whether the signed-in person finished onboarding. Only set on /app pages. */
    onboarded: boolean | null;
  }
}
