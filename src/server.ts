import "dotenv/config";
import app from "./app.js"; // aqui está seu Express app já com routers
import process from "process";

const isDev = process.env.NODE_ENV !== "production";
if (isDev) {
  console.log("Environment: development (checagens não sensíveis)");
  console.log(" - SUPABASE_URL set?", !!process.env.SUPABASE_URL);
  console.log(
    " - SUPABASE_SERVICE_ROLE_KEY set?",
    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  console.log(" - MP_ACCESS_TOKEN set?", !!process.env.MP_ACCESS_TOKEN);
}

// ============================
// Porta do servidor
// ============================
const PORT: number = Number(process.env.PORT) || 3333;

// ============================
// Start do servidor
// ============================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  console.log(`🌐 URL local: http://localhost:${PORT}`);
  console.log(
    `🌍 URL pública (ngrok): ${process.env.PUBLIC_API_URL || "não definida"}`,
  );
});
