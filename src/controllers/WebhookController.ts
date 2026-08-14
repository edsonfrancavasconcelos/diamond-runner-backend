import { Request, Response } from 'express';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { supabase } from '../services/supabase.js';

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || '' 
});
const payment = new Payment(client);

export const handleWebhook = async (req: Request, res: Response) => {
  const { action, data, type } = req.body;

  // O Mercado Pago às vezes envia 'type' em vez de 'action' dependendo da versão
  const resourceAction = action || type;

  try {
    if (resourceAction === 'payment.created' || resourceAction === 'payment.updated' || req.body.topic === 'payment') {
      const paymentId = data?.id || req.query.id; // Captura ID do corpo ou da query string

      if (!paymentId) return res.status(200).send('OK');

      const paymentInfo = await payment.get({ id: paymentId });

      if (paymentInfo.status === 'approved') {
        // 1. Prioridade: Buscar pelo ID do pagamento que salvamos no 'asaas_id' (ou external_reference)
        // 2. Fallback: Buscar pelo email
        const userEmail = paymentInfo.payer?.email;
        const userId = paymentInfo.external_reference; // Lembra que passamos o authData.user.id no App?

        const { error } = await supabase
          .from('profiles')
          .update({ 
            status: 'active', // Ajustado de is_active para status conforme seu Dashboard
            updated_at: new Date()
          })
          .or(`id.eq.${userId},email.eq.${userEmail},asaas_id.eq.${paymentId}`); 
          // O .or garante que o usuário seja ativado de qualquer forma segura

        if (error) {
          console.error(`❌ Erro ao ativar perfil:`, error.message);
          return res.status(200).send('OK'); // Retornamos 200 pro MP não ficar reenviando
        }

        console.log(`✅ Pagamento aprovado & Perfil ativado: ${userEmail || userId}`);
      }
    }

    return res.status(200).send('OK');
  } catch (error: any) {
    console.error('❌ Erro no Webhook Mercado Pago:', error.message);
    return res.status(200).send('OK');
  }
};
