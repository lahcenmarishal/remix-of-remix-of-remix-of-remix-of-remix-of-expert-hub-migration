import { sendWelcomeEmail } from "@/lib/notify.functions";

const KEY = "profinder.welcome_email_sent";

/** Envoie l'email de bienvenue une seule fois par navigateur/compte. */
export async function sendWelcomeOnce(userId: string): Promise<void> {
  try {
    if (localStorage.getItem(KEY) === userId) return;
  } catch {
    /* stockage indisponible : on tente quand même l'envoi */
  }
  try {
    const result = await sendWelcomeEmail();
    if (result.sent) localStorage.setItem(KEY, userId);
  } catch {
    /* l'email de bienvenue n'est pas bloquant */
  }
}
