import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import type { AccountRole } from "@/lib/pending-role";

const PUBLIC_SITE_URL = "https://profinder.ma";
const OAUTH_RELAY_URL = "https://hub-mover-magic.lovable.app";

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
  // The auth service currently allow-lists the Lovable published origin, not
  // profinder.ma. Use it only as a same-project relay; the root script forwards
  // the complete path, query and OAuth hash to the public domain immediately.
  const returnOrigin = usesLovableOAuthBroker(window.location.hostname) ? origin : OAUTH_RELAY_URL;
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