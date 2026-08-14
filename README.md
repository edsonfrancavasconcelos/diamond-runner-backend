# Diamond Backend

Este backend fornece endpoints usados pelo app móvel.

Stripe
- Endpoint: `POST /payments/create` (autenticado)
- Variáveis necessárias no `.env` do backend:
  - `STRIPE_SECRET_KEY` (secret, server-side)
  - `STRIPE_WEBHOOK_SECRET` (para verificar webhooks)

Como testar localmente
```bash
cp .env.example .env
# preencher STRIPE_SECRET_KEY e outras variáveis
npm install
npm run dev
```
Stripe webhook testing
Use the Stripe CLI to forward webhooks to your local server for testing:

```bash
stripe listen --forward-to localhost:3333/api/webhook/stripe
```

The backend will verify `STRIPE_WEBHOOK_SECRET` signature. Configure this in your `.env` accordingly.
