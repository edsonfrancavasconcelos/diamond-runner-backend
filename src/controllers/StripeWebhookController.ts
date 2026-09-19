import { Request, Response } from "express";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../services/supabase.js";

export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = (req.headers["stripe-signature"] as string) || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).send("Webhook not configured");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2022-11-15",
  });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      webhookSecret
    );
  } catch (err: any) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      console.log("💳 checkout.session.completed", session.id);
      console.log("payment_status:", session.payment_status);

      if (session.payment_status === "paid") {
        await activateFromCheckoutMetadata(session);
      }
    }

    if (event.type === "payment_intent.succeeded") {
      console.log("payment_intent.succeeded", (event.data.object as any).id);
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err?.message || err);
    // Ainda responde 200 para a Stripe não reenviar em loop infinito em dev
  }

  return res.json({ received: true });
};

async function activateFromCheckoutMetadata(session: Stripe.Checkout.Session) {
  const meta = session.metadata || {};

  const cleanEmail = String(meta.email || session.customer_email || "")
    .trim()
    .toLowerCase();
  const cleanFullName = String(meta.fullName || "").trim();
  const cleanDocumentId = String(meta.documentId || "").replace(/\D/g, "");
  const cleanWhatsapp = String(meta.phone || "").replace(/\D/g, "");
  const cleanSponsorUuid = String(meta.sponsorUuid || "").trim();
  const cleanSponsorId = String(meta.sponsorId || "").trim().toUpperCase();
  const cleanPlanName = String(meta.planName || "DISTRIBUIDOR")
    .trim()
    .toUpperCase();
  const numericAmount = Number(meta.amount || 0);

  console.log("🔔 Ativando via webhook:", {
    cleanEmail,
    cleanFullName,
    cleanSponsorUuid,
    cleanPlanName,
    numericAmount,
  });

  if (!cleanEmail || !cleanFullName || !cleanDocumentId || !cleanSponsorUuid) {
    console.error("Webhook: metadata incompleta", meta);
    return;
  }

  // Já existe?
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, id_dr")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (existing) {
    console.log("Webhook: e-mail já cadastrado", existing.id_dr);
    return;
  }

  // Patrocinador
  const { data: sponsor, error: sponsorError } = await supabase
    .from("profiles")
    .select("id, id_dr, full_name")
    .eq("id", cleanSponsorUuid)
    .maybeSingle();

  if (sponsorError || !sponsor) {
    console.error("Webhook: patrocinador inválido", sponsorError);
    return;
  }

  // ID DR
  let generatedIdDr = "";
  for (let i = 0; i < 50 && !generatedIdDr; i++) {
    const candidate = `DR${Math.floor(100000 + Math.random() * 900000)}`;
    const { data: exists } = await supabase
      .from("profiles")
      .select("id")
      .eq("id_dr", candidate)
      .maybeSingle();
    if (!exists) generatedIdDr = candidate;
  }
  if (!generatedIdDr) {
    console.error("Webhook: não gerou id_dr");
    return;
  }

  const temporaryPassword =
    uuidv4().replace(/-/g, "").slice(0, 16) + "Aa1!";

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: cleanFullName,
        document_id: cleanDocumentId,
        whatsapp: cleanWhatsapp,
        id_dr: generatedIdDr,
        sponsor_uuid: sponsor.id,
        sponsor_id: sponsor.id_dr || cleanSponsorId,
        plan_name: cleanPlanName,
      },
    });

  if (authError || !authData?.user) {
    console.error("Webhook: erro auth", authError);
    return;
  }

  const newUser = authData.user;

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: newUser.id,
      email: cleanEmail,
      id_dr: generatedIdDr,
      document_id: cleanDocumentId,
      full_name: cleanFullName,
      status: "ATIVO",
      sponsor_id: sponsor.id,
      is_active: true,
      level: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Webhook: erro profile", profileError);
    await supabase.auth.admin.deleteUser(newUser.id);
    return;
  }

  // user_plan opcional
  try {
    const { data: up } = await supabase
      .from("user_plan")
      .select("user_id")
      .eq("user_id", newUser.id)
      .maybeSingle();

    if (!up) {
      await supabase.from("user_plan").insert({
        user_id: newUser.id,
        plan_id: 1,
        status: "active",
      });
    }
  } catch (e) {
    console.log("Webhook: user_plan ignorado", e);
  }

  console.log("🎉 WEBHOOK CADASTRO OK", {
    userId: newUser.id,
    id_dr: generatedIdDr,
    email: cleanEmail,
    plan: cleanPlanName,
  });
}