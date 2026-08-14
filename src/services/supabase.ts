import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("========================================");
console.log("🔐 SUPABASE BACKEND CONFIG");
console.log("========================================");
console.log(
  "SUPABASE_URL:",
  supabaseUrl
    ? supabaseUrl
    : "❌ AUSENTE",
);
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  supabaseServiceKey
    ? `OK (${supabaseServiceKey.substring(0, 12)}...)`
    : "❌ AUSENTE",
);
console.log("========================================");

if (!supabaseUrl) {
  throw new Error(
    "❌ SUPABASE_URL não foi encontrada no .env.",
  );
}

if (!supabaseServiceKey) {
  throw new Error(
    "❌ SUPABASE_SERVICE_ROLE_KEY não foi encontrada no .env.",
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);