import { supabase } from "@/integrations/supabase/client";
import { tryPublishPendingDraft } from "@/lib/request-draft";
import { resumeClientFlow } from "@/lib/student-need";
import { localPendingRole, type AccountRole } from "@/lib/pending-role";

const PENDING_OAUTH_KEY = "profinder.pending_oauth";

/** Mémorise qu'une connexion Google est en cours (avant la redirection). */
export function markOAuthPending(role: AccountRole) {
  try {
    sessionStorage.setItem(PENDING_OAUTH_KEY, role);
  } catch {
    /* stockage indisponible */
  }
}

/** Consomme le marqueur : retourne le rôle attendu si un retour OAuth est en cours. */
export function consumeOAuthPending(): AccountRole | null {
  try {
    const value = sessionStorage.getItem(PENDING_OAUTH_KEY);
    if (!value) return null;
    sessionStorage.removeItem(PENDING_OAUTH_KEY);
    return value === "pro" ? "pro" : "client";
  } catch {
    return null;
  }
}

export type PostAuthTarget =
  | { kind: "pro" }
  | { kind: "pro-onboarding" }
  | { kind: "request"; id: string; published: boolean }
  | { kind: "need" }
  | { kind: "requests" };

/** Destination après une authentification réussie, selon le rôle et l'état du parcours. */
export async function resolvePostAuthTarget(
  userId: string,
  role: AccountRole,
): Promise<PostAuthTarget> {
  if (role === "pro") {
    const { data } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    return data ? { kind: "pro" } : { kind: "pro-onboarding" };
  }

  const publishedId = await tryPublishPendingDraft(userId);
  if (publishedId) return { kind: "request", id: publishedId, published: true };

  const next = await resumeClientFlow(userId);
  if (next.kind === "request") return { kind: "request", id: next.id, published: false };
  if (next.kind === "need") return { kind: "need" };
  return { kind: "requests" };
}

/** Rôle réel du compte connecté (métadonnées d'inscription, sinon choix local). */
export function roleFromUser(
  metadata: Record<string, unknown> | undefined,
  fallback: AccountRole,
): AccountRole {
  const meta = metadata?.["role"];
  if (meta === "pro" || meta === "client") return meta;
  return localPendingRole() ?? fallback;
}

/** Lit le marqueur sans le consommer. */
export function peekOAuthPending(): AccountRole | null {
  try {
    const value = sessionStorage.getItem(PENDING_OAUTH_KEY);
    if (!value) return null;
    return value === "pro" ? "pro" : "client";
  } catch {
    return null;
  }
}
