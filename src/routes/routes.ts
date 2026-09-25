import { Request, Response, Router } from "express";
import { v4 as uuidv4 } from "uuid";

import { supabase } from "../services/supabase.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { AppController } from "../controllers/AppController.js";
import { SsoController } from "../controllers/SsoController.js";
import { handleStripeWebhook } from "../controllers/StripeWebhookController.js";
import {
  createPaymentIntent,
  createCheckoutSession,
} from "../controllers/PaymentController.js";

const router = Router();

/* ============================================================
   HEALTH CHECK
============================================================ */

router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    service: "diamond-backend",
    timestamp: new Date().toISOString(),
  });
});

/* ============================================================
   APPS
============================================================ */

router.get(
  "/apps",
  authenticate,
  AppController.list,
);

/* ============================================================
   SSO
============================================================ */

router.post(
  "/create-sso",
  authenticate,
  SsoController.create,
);

/* ============================================================
   STRIPE - CHECKOUT (público — onboarding sem login)
============================================================ */

router.post(
  "/payments/checkout",
  createCheckoutSession,
);


/* ============================================================
   USUÁRIO LOGADO
============================================================ */

router.get(
  "/user/me",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      if (!user?.id) {
        return res.status(401).json({
          status: "error",
          message: "Usuário não autenticado.",
        });
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
          id,
          email,
          id_dr,
          document_id,
          status,
          full_name,
          sponsor_id,
          is_active,
          level,
          created_at,
          updated_at
          `,
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error(
          "❌ ERRO SUPABASE /user/me:",
          error,
        );

        return res.status(500).json({
          status: "error",
          message: "Erro ao buscar usuário.",
          details: error.message,
        });
      }

      if (!data) {
        return res.status(404).json({
          status: "error",
          message: "Perfil do usuário não encontrado.",
        });
      }

      return res.status(200).json({
        status: "success",
        user_id: data.id,
        email: data.email || user.email || null,
        full_name: data.full_name,
        id_dr: data.id_dr,
        document_id: data.document_id,
        account_status: data.status,
        sponsor_id: data.sponsor_id,
        is_active: data.is_active,
        level: data.level,
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
    } catch (error: any) {
      console.error(
        "❌ ERRO /user/me:",
        error,
      );

      return res.status(500).json({
        status: "error",
        message: "Erro interno.",
        details: error?.message,
      });
    }
  },
);

/* ============================================================
   POST /api/auth/first-password

   Define a senha no PRIMEIRO ACESSO.
   Usa service role (admin.updateUserById).
   Não exige sessão do app.
============================================================ */

router.post(
  "/auth/first-password",
  async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();

      const idDr = String(req.body?.id_dr || "")
        .trim()
        .toUpperCase();

      const password = String(req.body?.password || "");

      console.log("");
      console.log("========================================");
      console.log("🔐 FIRST PASSWORD");
      console.log("========================================");
      console.log("E-mail:", email || "(vazio)");
      console.log("ID DR:", idDr || "(vazio)");
      console.log("========================================");

      if ((!email && !idDr) || password.length < 6) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_PAYLOAD",
          message:
            "Informe e-mail ou ID DR e senha com no mínimo 6 caracteres.",
        });
      }

      let query = supabase
        .from("profiles")
        .select(
          "id, email, id_dr, full_name, status, is_active",
        );

      if (email) {
        query = query.eq("email", email);
      } else {
        query = query.eq("id_dr", idDr);
      }

      const { data: profile, error: profileError } =
        await query.maybeSingle();

      if (profileError) {
        console.error(
          "❌ ERRO AO BUSCAR PROFILE:",
          profileError,
        );

        return res.status(500).json({
          status: "error",
          code: "PROFILE_LOOKUP_ERROR",
          message: "Erro ao localizar cadastro.",
          details: profileError.message,
        });
      }

      if (!profile) {
        return res.status(404).json({
          status: "error",
          code: "PROFILE_NOT_FOUND",
          message: "Cadastro não encontrado.",
        });
      }

      if (profile.is_active === false) {
        return res.status(403).json({
          status: "error",
          code: "PROFILE_INACTIVE",
          message: "Cadastro inativo.",
        });
      }

      if (
        profile.status &&
        String(profile.status).toUpperCase() !== "ATIVO"
      ) {
        return res.status(403).json({
          status: "error",
          code: "PROFILE_NOT_ACTIVE",
          message: "Cadastro não está ativo.",
        });
      }

      const { error: updateError } =
        await supabase.auth.admin.updateUserById(
          profile.id,
          {
            password,
            email_confirm: true,
          },
        );

      if (updateError) {
        console.error(
          "❌ ERRO updateUserById:",
          updateError,
        );

        return res.status(400).json({
          status: "error",
          code: "PASSWORD_UPDATE_ERROR",
          message:
            updateError.message ||
            "Não foi possível definir a senha.",
        });
      }

      console.log(
        "✅ SENHA DEFINIDA PARA:",
        profile.email,
        profile.id_dr,
      );

      return res.status(200).json({
        status: "success",
        message: "Senha definida com sucesso.",
        email: profile.email,
        id_dr: profile.id_dr,
        full_name: profile.full_name,
        userId: profile.id,
      });
    } catch (error: any) {
      console.error(
        "❌ ERRO /auth/first-password:",
        error,
      );

      return res.status(500).json({
        status: "error",
        code: "FIRST_PASSWORD_ERROR",
        message: error?.message || "Erro interno.",
      });
    }
  },
);

/* ============================================================
   POST /api/payments/confirm

   CADASTRO DEFINITIVO

   IMPORTANTE:

   profiles possui:

   id
   email
   id_dr
   document_id
   status
   created_at
   updated_at
   full_name
   sponsor_id
   is_active
   level

   NÃO usamos:
   - plan_id
   - payment_status
   - whatsapp
   - phone

   WhatsApp fica somente no Auth metadata.

   IMPORTANTE SOBRE DUPLICIDADE:

   O Supabase pode possuir um TRIGGER que cria
   automaticamente o profile quando um usuário é
   criado no Auth.

   Por isso NÃO usamos insert().

   Usamos upsert() pelo id.
============================================================ */

router.post(
  "/payments/confirm",
  async (req: Request, res: Response) => {
    let createdAuthUserId: string | null = null;

    try {
      /* ======================================================
         RECEBE DADOS
      ====================================================== */

      const {
        sponsorUuid,
        sponsorId,
        email,
        fullName,
        documentId,
        whatsapp,
        phone,
        planName,
        amount,
      } = req.body;

      /* ======================================================
         LIMPEZA
      ====================================================== */

      const cleanEmail = String(email || "")
        .trim()
        .toLowerCase();

      const cleanFullName = String(
        fullName || "",
      ).trim();

      const cleanDocumentId = String(
        documentId || "",
      ).replace(/\D/g, "");

      const cleanWhatsapp = String(
        whatsapp || phone || "",
      ).replace(/\D/g, "");

      const cleanSponsorUuid = String(
        sponsorUuid || "",
      ).trim();

      const cleanSponsorId = String(
        sponsorId || "",
      )
        .trim()
        .toUpperCase();

      const cleanPlanName = String(
        planName || "DISTRIBUIDOR",
      )
        .trim()
        .toUpperCase();

      const numericAmount = Number(
        amount || 0,
      );

      /* ======================================================
         LOG
      ====================================================== */

      console.log("");
      console.log(
        "========================================",
      );
      console.log(
        "💎 DIAMOND RUNNER - CONFIRMAÇÃO",
      );
      console.log(
        "========================================",
      );

      console.log(
        "Nome:",
        cleanFullName,
      );

      console.log(
        "E-mail:",
        cleanEmail,
      );

      console.log(
        "CPF:",
        cleanDocumentId,
      );

      console.log(
        "WhatsApp:",
        cleanWhatsapp,
      );

      console.log(
        "Sponsor UUID:",
        cleanSponsorUuid,
      );

      console.log(
        "Sponsor ID:",
        cleanSponsorId,
      );

      console.log(
        "Plano:",
        cleanPlanName,
      );

      console.log(
        "Valor:",
        numericAmount,
      );

      console.log(
        "========================================",
      );

      /* ======================================================
         VALIDAÇÕES
      ====================================================== */

      if (!cleanEmail) {
        return res.status(400).json({
          status: "error",
          code: "EMAIL_REQUIRED",
          message: "E-mail obrigatório.",
        });
      }

      if (!cleanFullName) {
        return res.status(400).json({
          status: "error",
          code: "FULL_NAME_REQUIRED",
          message: "Nome completo obrigatório.",
        });
      }

      if (!cleanDocumentId) {
        return res.status(400).json({
          status: "error",
          code: "DOCUMENT_REQUIRED",
          message: "CPF obrigatório.",
        });
      }

      if (!cleanSponsorUuid) {
        return res.status(400).json({
          status: "error",
          code: "SPONSOR_REQUIRED",
          message: "Patrocinador obrigatório.",
        });
      }

      /* ======================================================
         1. VALIDA PATROCINADOR
      ====================================================== */

      console.log("");
      console.log(
        "🔎 VALIDANDO PATROCINADOR...",
      );

      console.log(
        "UUID:",
        cleanSponsorUuid,
      );

      const {
        data: sponsor,
        error: sponsorError,
      } = await supabase
        .from("profiles")
        .select(
          "id, id_dr, full_name, email, status, is_active, level",
        )
        .eq(
          "id",
          cleanSponsorUuid,
        )
        .maybeSingle();

      if (sponsorError) {
        console.error(
          "❌ ERRO SUPABASE AO VALIDAR PATROCINADOR:",
          sponsorError,
        );

        return res.status(500).json({
          status: "error",
          code: "SPONSOR_VALIDATION_ERROR",
          message: "Erro ao validar patrocinador.",
          details: sponsorError.message,
        });
      }

      if (!sponsor) {
        console.error(
          "❌ PATROCINADOR NÃO ENCONTRADO:",
          cleanSponsorUuid,
        );

        return res.status(400).json({
          status: "error",
          code: "SPONSOR_NOT_FOUND",
          message: "Patrocinador não encontrado.",
        });
      }

      console.log(
        "✅ PATROCINADOR ENCONTRADO",
      );

      console.log(
        "UUID:",
        sponsor.id,
      );

      console.log(
        "ID DR:",
        sponsor.id_dr,
      );

      console.log(
        "Nome:",
        sponsor.full_name,
      );

      console.log(
        "Status:",
        sponsor.status,
      );

      /* ======================================================
         2. VERIFICA E-MAIL EM PROFILES
      ====================================================== */

      console.log("");
      console.log(
        "🔎 VERIFICANDO E-MAIL...",
      );

      const {
        data: existingProfile,
        error: existingProfileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, email, id_dr, full_name, status",
        )
        .eq(
          "email",
          cleanEmail,
        )
        .maybeSingle();

      if (existingProfileError) {
        console.error(
          "❌ ERRO AO CONSULTAR PROFILE:",
          existingProfileError,
        );

        return res.status(500).json({
          status: "error",
          code: "PROFILE_CHECK_ERROR",
          message:
            "Erro ao verificar cadastro existente.",
          details:
            existingProfileError.message,
        });
      }

      if (existingProfile) {
        console.log(
          "⚠️ E-MAIL JÁ CADASTRADO:",
          existingProfile.id,
        );

        return res.status(409).json({
          status: "error",
          code: "PROFILE_ALREADY_EXISTS",
          message:
            "Este e-mail já possui cadastro.",
          userId:
            existingProfile.id,
          id_dr:
            existingProfile.id_dr,
        });
      }

      /* ======================================================
         3. GERA ID DR
      ====================================================== */

      console.log("");
      console.log(
        "🆔 GERANDO ID DR...",
      );

      let generatedIdDr = "";
      let attempts = 0;

      while (
        !generatedIdDr &&
        attempts < 50
      ) {
        attempts++;

        const randomDigits =
          Math.floor(
            100000 +
              Math.random() *
                900000,
          );

        const candidate =
          `DR${randomDigits}`;

        const {
          data: existingDr,
          error: existingDrError,
        } = await supabase
          .from("profiles")
          .select("id")
          .eq(
            "id_dr",
            candidate,
          )
          .maybeSingle();

        if (existingDrError) {
          console.error(
            "❌ ERRO AO VERIFICAR ID DR:",
            existingDrError,
          );

          throw new Error(
            `Erro ao verificar ID DR: ${existingDrError.message}`,
          );
        }

        if (!existingDr) {
          generatedIdDr =
            candidate;
        }
      }

      if (!generatedIdDr) {
        throw new Error(
          "Não foi possível gerar um ID DR único.",
        );
      }

      console.log(
        "✅ ID DR:",
        generatedIdDr,
      );

      /* ======================================================
         4. SENHA TEMPORÁRIA
      ====================================================== */

      const temporaryPassword =
        uuidv4()
          .replace(/-/g, "")
          .slice(0, 16) +
        "Aa1!";

      /* ======================================================
         5. CRIA AUTH
      ====================================================== */

      console.log("");
      console.log(
        "🆕 CRIANDO USUÁRIO NO AUTH...",
      );

      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.admin.createUser(
          {
            email: cleanEmail,
            password:
              temporaryPassword,
            email_confirm: true,

            user_metadata: {
              full_name:
                cleanFullName,

              document_id:
                cleanDocumentId,

              whatsapp:
                cleanWhatsapp,

              id_dr:
                generatedIdDr,

              sponsor_uuid:
                sponsor.id,

              sponsor_id:
                sponsor.id_dr ||
                cleanSponsorId,

              plan_name:
                cleanPlanName,
            },
          },
        );

      if (
        authError ||
        !authData?.user
      ) {
        console.error(
          "❌ ERRO AUTH:",
          authError,
        );

        const authMessage =
          authError?.message ||
          "";

        const lowerMessage =
          authMessage.toLowerCase();

        if (
          lowerMessage.includes(
            "already",
          ) ||
          lowerMessage.includes(
            "exists",
          ) ||
          lowerMessage.includes(
            "duplicate",
          )
        ) {
          return res.status(409).json({
            status: "error",
            code:
              "AUTH_USER_ALREADY_EXISTS",
            message:
              "Este e-mail já possui uma conta de acesso.",
          });
        }

        throw new Error(
          authMessage ||
            "Não foi possível criar o usuário.",
        );
      }

      const newUser =
        authData.user;

      createdAuthUserId =
        newUser.id;

      console.log(
        "✅ AUTH CRIADO:",
        newUser.id,
      );

      /* ======================================================
         6. CRIA OU ATUALIZA PROFILE
         
         NÃO USAR INSERT.

         O motivo é que o Supabase pode ter um trigger
         criando automaticamente o profile.

         upsert evita:

         duplicate key value violates unique constraint
         "profiles_pkey"
      ====================================================== */

      console.log("");
      console.log(
        "📝 CRIANDO/ATUALIZANDO PROFILE...",
      );

      const profilePayload = {
        id:
          newUser.id,

        email:
          cleanEmail,

        id_dr:
          generatedIdDr,

        document_id:
          cleanDocumentId,

        full_name:
          cleanFullName,

        status:
          "ATIVO",

        sponsor_id:
          sponsor.id,

        is_active:
          true,

        level:
          1,

        updated_at:
          new Date().toISOString(),
      };

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .upsert(
          profilePayload,
          {
            onConflict: "id",
          },
        )
        .select(
          `
          id,
          email,
          id_dr,
          document_id,
          status,
          full_name,
          sponsor_id,
          is_active,
          level,
          created_at,
          updated_at
          `,
        )
        .single();

      if (profileError) {
        console.error("");
        console.error(
          "❌ ERRO AO CRIAR/ATUALIZAR PROFILE:",
        );
        console.error(
          profileError,
        );

        throw new Error(
          profileError.message ||
            "Não foi possível criar o perfil.",
        );
      }

      console.log(
        "✅ PROFILE PRONTO:",
        profileData.id,
      );

      console.log(
        "🆔 ID DR:",
        profileData.id_dr,
      );

      console.log(
        "👤 SPONSOR UUID:",
        profileData.sponsor_id,
      );

      /* ======================================================
         7. USER PLAN
      ====================================================== */

      console.log("");
      console.log(
        "📦 VERIFICANDO USER_PLAN...",
      );

      const {
        data: existingUserPlan,
        error: existingUserPlanError,
      } = await supabase
        .from("user_plan")
        .select(
          "user_id, plan_id, status",
        )
        .eq(
          "user_id",
          newUser.id,
        )
        .maybeSingle();

      if (
        existingUserPlanError
      ) {
        console.error(
          "❌ ERRO AO VERIFICAR USER_PLAN:",
          existingUserPlanError,
        );

        throw new Error(
          existingUserPlanError.message,
        );
      }

      if (!existingUserPlan) {
        console.log(
          "📦 CRIANDO USER_PLAN...",
        );

        const {
          error: userPlanError,
        } = await supabase
          .from("user_plan")
          .insert({
            user_id:
              newUser.id,

            plan_id:
              1,

            status:
              "active",
          });

        if (userPlanError) {
          console.error(
            "❌ ERRO AO CRIAR USER_PLAN:",
            userPlanError,
          );

          throw new Error(
            userPlanError.message ||
              "Não foi possível criar o plano do usuário.",
          );
        }

        console.log(
          "✅ USER_PLAN CRIADO.",
        );
      } else {
        console.log(
          "✅ USER_PLAN JÁ EXISTE.",
        );
      }

      /* ======================================================
         8. SUCESSO
      ====================================================== */

      console.log("");
      console.log(
        "========================================",
      );
      console.log(
        "🎉 CADASTRO CONCLUÍDO",
      );
      console.log(
        "========================================",
      );

      console.log(
        "UUID:",
        newUser.id,
      );

      console.log(
        "ID DR:",
        generatedIdDr,
      );

      console.log(
        "Patrocinador UUID:",
        sponsor.id,
      );

      console.log(
        "Patrocinador DR:",
        sponsor.id_dr,
      );

      console.log(
        "Patrocinador:",
        sponsor.full_name,
      );

      console.log(
        "Plano:",
        cleanPlanName,
      );

      console.log(
        "Valor:",
        numericAmount,
      );

      console.log(
     
      );

      return res.status(200).json({
        status: "success",

        message:
          "Usuário criado e ativado com sucesso.",

        userId:
          newUser.id,

        id_dr:
          generatedIdDr,

        fullName:
          cleanFullName,

        email:
          cleanEmail,

        sponsorUuid:
          sponsor.id,

        sponsorId:
          sponsor.id_dr ||
          cleanSponsorId,

        sponsorName:
          sponsor.full_name ||
          "PATROCINADOR",

        planName:
          cleanPlanName,

        amount:
          numericAmount,
      });
    } catch (error: any) {
      console.error("");
      console.error(
       
      );
      console.error(
        "❌ ERRO DIAMOND BACKEND",
      );
      console.error(
      
      );
      console.error(
        error,
      );
      console.error(
   
      );

        if (createdAuthUserId) {
        try {
          await supabase.auth.admin.deleteUser(
            createdAuthUserId,
          );

          console.log(
            "↩️ AUTH REMOVIDO APÓS FALHA.",
          );
        } catch (rollbackError) {
          console.error(
            "❌ ERRO NO ROLLBACK AUTH:",
            rollbackError,
          );
        }
      }

      return res.status(500).json({
        status: "error",
        code: "REGISTRATION_ERROR",
        message:
          error?.message ||
          "Erro interno ao confirmar cadastro.",
      });
    }
  },
);



router.post(
  "/payments/create",
  authenticate,
  createPaymentIntent,
);


export default router;