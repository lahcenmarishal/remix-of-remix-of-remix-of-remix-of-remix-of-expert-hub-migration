import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

type GoogleOAuthResult =
  | { error: null; redirected: true }
  | { error: null; redirected?: false }
  | { error: Error; redirected?: false };

function usesLovableOAuthBroker(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com")
  );
}

/**
 * Lovable-hosted previews provide /~oauth/initiate. External hosts such as
 * Netlify do not, so they must start Google OAuth directly through auth.
 */
export async function signInWithGoogle(): Promise<GoogleOAuthResult> {
  const origin = window.location.origin;

  if (usesLovableOAuthBroker(window.location.hostname)) {
    return lovable.auth.signInWithOAuth("google", { redirect_uri: origin });
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth?mode=signin&role=client`,
      queryParams: { prompt: "select_account" },
    },
  });

  return error ? { error } : { error: null, redirected: true };
}