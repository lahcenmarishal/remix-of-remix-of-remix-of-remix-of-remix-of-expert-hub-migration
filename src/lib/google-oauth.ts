import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import type { AccountRole } from "@/lib/pending-role";

const PUBLIC_SITE_URL = "https://profinder.ma";

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
export async function signInWithGoogle(
  role: AccountRole = "client",
): Promise<GoogleOAuthResult> {
  const origin = window.location.origin;
  const returnOrigin = usesLovableOAuthBroker(window.location.hostname)
    ? origin
    : PUBLIC_SITE_URL;
  const returnUrl = `${returnOrigin}/auth?mode=signin&role=${role}`;

  if (usesLovableOAuthBroker(window.location.hostname)) {
    return lovable.auth.signInWithOAuth("google", { redirect_uri: returnUrl });
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: returnUrl,
      queryParams: { prompt: "select_account" },
    },
  });

  return error ? { error } : { error: null, redirected: true };
}