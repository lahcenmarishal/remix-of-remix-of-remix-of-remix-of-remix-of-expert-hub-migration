import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Notifie les professeurs concernés qu'une nouvelle demande est disponible.
 * Volontairement accessible sans session : une demande peut être créée par un
 * visiteur non connecté (demande directe à un professeur). Une garde anti-doublon
 * évite toute création répétée pour la même demande.
 */
export const notifyNewRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const link = `/pro/demandes?r=${data.requestId}`;
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("link", link)
      .limit(1);
    if (existing && existing.length > 0) return { notified: 0 };

    const { data: request } = await supabaseAdmin
      .from("requests")
      .select("id, service_id, city_id, mode, target_professional_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!request) return { notified: 0 };


    let proIds: string[] = [];
    if (request.target_professional_id) {
      proIds = [request.target_professional_id];
    } else {
      const { data: pros } = await supabaseAdmin
        .from("professionals")
        .select("id, user_id, city_id, professional_services(service_id)")
        .eq("status", "active");
      proIds = (pros ?? [])
        .filter((p) => {
          if (!p.user_id) return false;
          const services = (p.professional_services ?? []).map((s) => s.service_id);
          if (request.service_id && services.length > 0 && !services.includes(request.service_id))
            return false;
          if (request.mode !== "online" && request.city_id && p.city_id !== request.city_id)
            return false;
          return true;
        })
        .map((p) => p.id);
    }
    if (proIds.length === 0) return { notified: 0 };

    const { data: targets } = await supabaseAdmin
      .from("professionals")
      .select("id, user_id")
      .in("id", proIds);

    const rows = (targets ?? [])
      .filter((t) => Boolean(t.user_id))
      .map((t) => ({
        user_id: t.user_id as string,
        type: request.target_professional_id ? "request_targeted" : "request_match",
        title: request.target_professional_id
          ? "Nouvelle demande directe"
          : "Nouvelle demande pour vous",
        body: request.target_professional_id
          ? "Un élève vous a envoyé une demande directe."
          : "Un élève recherche un professeur correspondant à votre profil.",
        link,

      }));
    if (rows.length === 0) return { notified: 0 };

    await supabaseAdmin.from("notifications").insert(rows);

    const { emailTemplates, sendEmail, SITE_URL } = await import("@/lib/email.server");
    const emails = await resolveEmails(
      supabaseAdmin,
      rows.map((r) => r.user_id),
    );
    if (emails.length > 0) {
      const tpl = emailTemplates.newRequestForPro({
        requestUrl: `${SITE_URL}${link}`,
        direct: Boolean(request.target_professional_id),
      });
      await Promise.all(
        emails.map((to) => sendEmail({ to, subject: tpl.subject, html: tpl.html })),
      );
    }

    return { notified: rows.length };
  });

/** Récupère les adresses email des comptes concernés (via l'API admin). */
async function resolveEmails(
  admin: { auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string | null } | null } }> } } },
  userIds: string[],
): Promise<string[]> {
  const unique = [...new Set(userIds)];
  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        return data.user?.email ?? null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((email): email is string => Boolean(email));
}


/** Notifie l'élève qu'un professeur est intéressé par sa demande. */
export const notifyProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ requestId: z.string().uuid(), professionalId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: request }, { data: pro }] = await Promise.all([
      supabaseAdmin.from("requests").select("id, client_id").eq("id", data.requestId).maybeSingle(),
      supabaseAdmin
        .from("professionals")
        .select("display_name")
        .eq("id", data.professionalId)
        .maybeSingle(),
    ]);
    if (!request?.client_id) return { notified: 0 };

    await supabaseAdmin.from("notifications").insert({
      user_id: request.client_id,
      type: "proposal_received",
      title: "Proposition reçue",
      body: `${pro?.display_name ?? "Un professeur"} est intéressé par votre demande.`,
      link: `/demandes/${request.id}`,
    });

    const { emailTemplates, sendEmail, SITE_URL } = await import("@/lib/email.server");
    const [to] = await resolveEmails(supabaseAdmin, [request.client_id]);
    if (to) {
      const tpl = emailTemplates.proposalForClient({
        proName: pro?.display_name ?? "Un professeur",
        requestUrl: `${SITE_URL}/demandes/${request.id}`,
      });
      await sendEmail({ to, subject: tpl.subject, html: tpl.html });
    }

    return { notified: 1 };
  });

/** Email de bienvenue envoyé après la confirmation du compte. */
export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = data.user?.email;
    if (!email) return { sent: false };

    const { emailTemplates, sendEmail } = await import("@/lib/email.server");
    const meta = (data.user?.user_metadata ?? {}) as { first_name?: string; full_name?: string };
    const tpl = emailTemplates.welcome(meta.first_name ?? meta.full_name);
    const result = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
    return { sent: result.sent };
  });

