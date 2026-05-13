import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";

// Single shared Supabase client. detectSessionInUrl lets the SDK pick up
// OAuth callbacks automatically when the browser lands back on the app
// after a Google redirect; persistSession + autoRefreshToken keep the
// session alive across reloads and refresh JWTs in the background.

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function currentUserDisplayName(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name = (meta?.name as string | undefined) ?? user.email ?? null;
  return name;
}

export function signInWithGoogle(redirectTo: string): Promise<unknown> {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}

export function signOut(): Promise<unknown> {
  return supabase.auth.signOut();
}
