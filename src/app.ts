import express from "express";
import cors from "cors";
import router from "./routes/routes.js";
import { handleStripeWebhook } from "./controllers/StripeWebhookController.js";

const app = express();

app.use(cors());

// Webhook Stripe: body RAW (obrigatório para validar assinatura)
app.post(
  "/api/webhook/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json());

app.use("/api", router);

export default app;