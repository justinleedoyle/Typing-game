// Supabase project configuration. These two values are deliberately public:
// the publishable key only grants what Row Level Security policies allow,
// and the URL is the public REST endpoint. Never commit the secret key
// (`sb_secret_...`); that one bypasses RLS and must stay server-side only.

export const SUPABASE_URL = "https://sdmbmwulutbyhxhueuia.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_UT_JvC4qUDqMWMdXK8R1oQ_8NMgYhMC";
