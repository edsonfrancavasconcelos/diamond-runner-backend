import { Request, Response } from 'express';
import Stripe from 'stripe';

export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = (req.headers['stripe-signature'] as string) || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).send('Webhook not configured');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2022-11-15' });

  let event: Stripe.Event;
  try {
    // req.body is raw buffer because of express.raw middleware
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err: any) {
    console.error('⚠️  Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
      // TODO: atualizar estado do pagamento no banco
      break;
    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object as Stripe.PaymentIntent;
      console.warn('Payment failed:', failedIntent.last_payment_error?.message);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};
