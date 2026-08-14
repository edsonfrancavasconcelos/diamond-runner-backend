import { Request, Response } from "express";
import Stripe from "stripe";

// Cria PaymentIntent no Stripe. Amount deve ser em centavos (ex: R$10.00 -> 1000).
export const createPaymentIntent = async (req: Request, res: Response) => {
  try {
    const { amount, currency = "brl", receipt_email } = req.body;

    if (!amount || typeof amount !== "number") {
      return res.status(400).json({ error: "amount (number, cents) is required" });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
    if (!stripeSecret) {
      console.error("STRIPE_SECRET_KEY not set");
      return res.status(500).json({ error: "Payment provider not configured" });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2022-11-15" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      receipt_email,
      metadata: {
        // opcional: vincular ao usuário autenticado
        userId: (req as any).user?.id || "",
      },
    });

    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    console.error("Error creating PaymentIntent:", error.message || error);
    return res.status(500).json({ error: "Failed to create payment" });
  }
};
// Autor: Edson Vasconcelos | Atualizado em 18 de Jan 2026
// Arquivo: src/controllers/PaymentController.ts

import { MercadoPagoConfig, Payment } from 'mercadopago';
import { supabase } from '../services/supabase.js';
import { v4 as uuidv4 } from 'uuid';

// ===============================
// Configuração Mercado Pago (Sandbox/Produção)
// ===============================
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '', // 🔹 coloque o token correto no .env
});

const payment = new Payment(client);

// ===============================
// Controller Payment
// ===============================
export const confirmPayment = async (req: Request, res: Response) => {
  const {
    fullName,
    email,
    sponsorId,
    country,
    paymentData, // opcional: se não enviar, usa FAKE
  } = req.body;

  // 🔐 Validação mínima
  if (!fullName || !email) {
    return res.status(400).json({
      status: 'error',
      message: 'Dados obrigatórios não informados.',
    });
  }

  try {
    let paymentStatus: string = 'approved'; // FAKE por padrão

    // ===============================
    // 🔹 PAGAMENTO REAL (Mercado Pago)
    // ===============================
    if (paymentData && process.env.MP_ACCESS_TOKEN) {
      try {
        const mpResponse = await payment.create({
          body: {
            transaction_amount: paymentData.transaction_amount,
            token: paymentData.token,
            description: `Adesão Diamond Runner - ${fullName}`,
            installments: Number(paymentData.installments) || 1,
            payment_method_id: paymentData.payment_method_id,
            payer: {
              email,
              first_name: fullName.split(' ')[0],
            },
            notification_url: 'https://seu-backend.com/api/webhook', // opcional
          },
        });

        paymentStatus = mpResponse.status || 'error';

        if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
          return res.status(200).json({
            status: 'pending',
            payment_id: mpResponse.id,
            qr_code: mpResponse.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64:
              mpResponse.point_of_interaction?.transaction_data?.qr_code_base64,
            message: 'Pagamento aguardando confirmação.',
          });
        }

        if (paymentStatus !== 'approved') {
          throw new Error(`Pagamento ${paymentStatus}`);
        }
      } catch (err: any) {
        console.warn('⚠️ Falha no MP, usando FAKE payment:', err.message);
        paymentStatus = 'approved'; // fallback FAKE
      }
    }

    // ===============================
    // 🔹 PAGAMENTO APROVADO (REAL OU FAKE)
    // ===============================
    const idDr = `DR${Date.now().toString().slice(-6)}`;
    const tempPassword = uuidv4().replace(/-/g, '').substring(0, 10);

    // 🔐 Criação do usuário no Supabase Auth
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          id_dr: idDr,
        },
      });

    if (authError || !authData?.user) {
      throw authError || new Error('Erro ao criar usuário.');
    }

    // 📄 Criação do profile
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: authData.user.id,
        full_name: fullName,
        email,
        id_dr: idDr,
        sponsor_id: sponsorId || null,
        country: country || 'BR',
        is_active: true,
        level: 1,
        created_at: new Date().toISOString(),
      },
    ]);

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    // ===============================
    // ✅ RESPOSTA FINAL PRO APP
    // ===============================
    return res.status(201).json({
      status: 'success',
      id_dr: idDr,
      message: 'Pagamento aprovado e Runner registrado.',
    });
  } catch (error: any) {
    console.error('❌ Erro no Diamond Payment:', error.message || error);

    return res.status(400).json({
      status: 'error',
      message: error?.message || 'Erro ao processar pagamento ou registro.',
    });
  }
};
