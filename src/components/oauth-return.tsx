import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  consumeOAuthPending,
  peekOAuthPending,
  resolvePostAuthTarget,
  roleFromUser,
} from "@/lib/oauth-flow";

/**
 * Redirige l'utilisateur vers le bon espace après un retour de connexion Google
 * (le fournisseur renvoie toujours sur l'origine du site).
 */
export function OAuthReturnHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!peekOAuthPending()) return;
    let cancelled = false;

    const finish = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || cancelled) return;
      const expected = consumeOAuthPending();
      if (!expected) return;

      const role = roleFromUser(user.user_metadata ?? undefined, expected);

      // Fiche profil garantie (nom + photo Google) pour la messagerie et les avis.
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName =
        (typeof meta["full_name"] === "string" && meta["full_name"]) ||
        (typeof meta["name"] === "string" && meta["name"]) ||
        null;
      const avatar =
        (typeof meta["avatar_url"] === "string" && meta["avatar_url"]) ||
        (typeof meta["picture"] === "string" && meta["picture"]) ||
        null;
      await supabase.from("profiles").upsert({
        id: user.id,
        ...(fullName ? { full_name: fullName } : {}),
        ...(avatar ? { avatar_url: avatar } : {}),
      });

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
