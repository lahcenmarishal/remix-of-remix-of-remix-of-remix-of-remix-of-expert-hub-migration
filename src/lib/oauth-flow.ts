import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
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

function googleProfile(user: User) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (typeof meta["full_name"] === "string" && meta["full_name"]) ||
    (typeof meta["name"] === "string" && meta["name"]) ||
    null;
  const avatarUrl =
    (typeof meta["avatar_url"] === "string" && meta["avatar_url"]) ||
    (typeof meta["picture"] === "string" && meta["picture"]) ||
    null;
  const parts = fullName?.trim().split(/\s+/) ?? [];
  return {
    fullName,
    avatarUrl,
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

/**
 * Termine la création du compte applicatif après Google. L'identité reste
 * unique côté authentification ; cette fonction crée seulement les fiches
 * Profinder manquantes et peut donc être rejouée sans doublon.
 */
export async function ensureOAuthAccount(user: User, requestedRole: AccountRole) {
  const role = roleFromUser(user.user_metadata ?? undefined, requestedRole);
  const identity = googleProfile(user);

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    ...(identity.fullName ? { full_name: identity.fullName } : {}),
    ...(identity.avatarUrl ? { avatar_url: identity.avatarUrl } : {}),
  });
  if (profileError) throw profileError;

  const metadataRole = user.user_metadata?.["role"];
  if (metadataRole !== "pro" && metadataRole !== "client") {
    const { error } = await supabase.auth.updateUser({ data: { role } });
    if (error) throw error;
  }

  if (role === "pro") {
    const { data: existing, error: lookupError } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!existing) {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("is_active", true)
        .order("sort")
        .limit(1)
        .maybeSingle();
      if (categoryError) throw categoryError;
      if (!category) throw new Error("Catalogue indisponible");

      const { error: createError } = await supabase.from("professionals").insert({
        user_id: user.id,
        category_id: category.id,
        display_name: identity.fullName || user.email || "Professeur",
        first_name: identity.firstName,
        last_name: identity.lastName,
        email: user.email ?? null,
        photo_url: identity.avatarUrl,
        onboarding_step: 2,
        status: "draft",
      });
      if (createError && createError.code !== "23505") throw createError;
    }
  }

  return role;
}

/** Destination après une authentification réussie, selon le rôle et l'état du parcours. */
export async function resolvePostAuthTarget(
  userId: string,
  role: AccountRole,
): Promise<PostAuthTarget> {
  if (role === "pro") {
    const { data } = await supabase
      .from("professionals")
      .select("id, onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.onboarding_completed ? { kind: "pro" } : { kind: "pro-onboarding" };
  }

  const publishedId = await tryPublishPendingDraft(userId);
  if (publishedId) return { kind: "request", id: publishedId, published: true };

  const next = await resumeClientFlow(userId);
  if (next.kind === "request") return { kind: "request", id: next.id, published: false };
  if (next.kind === "need") return { kind: "need" };
  return { kind: "requests" };
}

/** Rôle réel du compte connecté (métadonnées d'inscription, sinon choix explicite). */
export function roleFromUser(
  metadata: Record<string, unknown> | undefined,
  fallback: AccountRole,
): AccountRole {
  const meta = metadata?.["role"];
  if (meta === "pro" || meta === "client") return meta;
  return fallback;
}

/** Lit le marqueur sans le consommer. */
export function peekOAuthPending(): AccountRole | null {
  try {
    const value = sessionStorage.getItem(PENDING_OAUTH_KEY);
    if (value === "pro" || value === "client") return value;
  } catch {
    /* stockage indisponible */
  }
  return null;
}

/**
 * Rôle attendu au retour de Google : paramètre d'URL (le plus fiable, il
 * survit à un nouvel onglet), puis marqueur de session, puis choix local.
 */
export function expectedOAuthRole(): AccountRole | null {
  try {
    const param = new URLSearchParams(window.location.search).get("role");
    if (param === "pro" || param === "client") return param;
  } catch {
    /* URL indisponible */
  }
  return peekOAuthPending() ?? localPendingRole();
}
