import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  consumeOAuthPending,
  ensureOAuthAccount,
  expectedOAuthRole,
  resolvePostAuthTarget,
} from "@/lib/oauth-flow";
import { clearPendingRole } from "@/lib/pending-role";

/**
 * Redirige l'utilisateur vers le bon espace après un retour de connexion Google
 * (le fournisseur renvoie toujours sur une page publique du site).
 */
export function OAuthReturnHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const expected = expectedOAuthRole();
    if (!expected) return;
    let cancelled = false;
    let done = false;

    const finish = async () => {
      if (done) return;
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user || cancelled) return;
        done = true;
        consumeOAuthPending();
        clearPendingRole();

        const role = await ensureOAuthAccount(user, expected);
        const target = await resolvePostAuthTarget(user.id, role);
        if (cancelled) return;
        switch (target.kind) {
          case "pro":
            navigate({ to: "/pro" });
            break;
          case "pro-onboarding":
            navigate({ to: "/pro/inscription" });
            break;
          case "request":
            if (target.published) toast.success("🎉 Votre demande a été publiée !");
            navigate({ to: "/demandes/$id", params: { id: target.id } });
            break;
          case "need":
            navigate({ to: "/mon-besoin" });
            break;
          default:
            navigate({ to: "/demandes" });
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Création du compte impossible");
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) void finish();
    });
    void finish();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return null;
}
