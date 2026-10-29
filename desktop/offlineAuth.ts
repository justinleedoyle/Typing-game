// Desktop is an offline guest edition. Browser account/cloud behavior remains
// in its existing module; desktop never opens or pretends to verify an account.
export async function currentUserId(): Promise<null> { return null; }
export async function currentUserDisplayName(): Promise<null> { return null; }
export async function signInWithGoogle(): Promise<never> { throw new Error("Account sign-in is not available in this offline edition."); }
export async function signOut(): Promise<void> {}
export const supabase = { auth: {
  async getSession() { return { data: { session: null }, error: null }; },
  onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
} };
