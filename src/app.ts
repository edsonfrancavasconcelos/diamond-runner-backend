
import express from 'express';
import cors from 'cors';
import router from './routes/routes.js'; 
const app = express();

app.use(cors());
// Para webhooks Stripe precisamos do corpo bruto em /api/webhook/stripe
app.use('/api/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());

// 🔥 PREFIXO PADRÃO
app.use('/api', router);

export default app;
