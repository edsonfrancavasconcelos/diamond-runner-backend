import { Request, Response } from "express";
import { supabase } from "../services/supabase.js";

export const handleAsaasWebhook = async (req: Request, res: Response) => {
    try {
        const { event, payment } = req.body;

        // Asaas envia diferentes eventos. Só nos importamos com o recebimento do pagamento.
        if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
            const paymentId = payment?.id;
            const userId = payment?.externalReference; // ID do usuário passado no PaymentScreen.js
            const amount = Number(payment?.value || 0);

            if (!userId) {
                return res.status(200).send("OK");
            }

            // 1. Busca o usuário que pagou
            const { data: userProfile, error: profileError } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .single();

            if (profileError || !userProfile) {
                console.error(
                    "❌ Asaas Webhook: Usuário não encontrado",
                    userId,
                );
                return res.status(200).send("OK");
            }

            // 2. Verifica se o usuário já não foi ativado (evitar duplicidade de comissão)
            if (userProfile.status === "active") {
                console.log(`⚠️ Usuário ${userId} já está ativo. Ignorando.`);
                return res.status(200).send("OK");
            }

            // 3. Ativa o usuário
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    status: "active",
                    payment_status: "CONFIRMED",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", userId);

            if (updateError) {
                console.error(
                    "❌ Asaas Webhook: Erro ao ativar usuário",
                    updateError,
                );
                return res.status(200).send("OK");
            }

            console.log(
                `✅ Pagamento Asaas confirmado: ${paymentId}. Usuário ${userId} ativado.`,
            );

            // 4. Calcula e paga a comissão pro Patrocinador
            const sponsorId = userProfile.sponsor_id;
            if (sponsorId) {
                let commissionRate = 0;

                // Regras de comissão baseadas no valor pago da adesão
                // DISTRIBUIDOR: R$ 99 (10%)
                // BUILDER: R$ 299 (12%)
                // PRIME: R$ 799 (20%)
                // ELITE: R$ 1599 (27%)
                if (amount >= 1599) {
                    commissionRate = 0.27;
                } else if (amount >= 799) {
                    commissionRate = 0.20;
                } else if (amount >= 299) {
                    commissionRate = 0.12;
                } else if (amount >= 99) {
                    commissionRate = 0.10;
                }

                if (commissionRate > 0) {
                    const commissionAmount = amount * commissionRate;

                    // Busca patrocinador para pegar o saldo atual
                    const { data: sponsorProfile } = await supabase
                        .from("profiles")
                        .select("balance, direct_bonus")
                        .eq("id", sponsorId)
                        .single();

                    if (sponsorProfile) {
                        const newBalance = Number(sponsorProfile.balance || 0) +
                            commissionAmount;
                        const newDirectBonus =
                            Number(sponsorProfile.direct_bonus || 0) +
                            commissionAmount;

                        // Atualiza saldos do patrocinador (Wallet e Direct Bonus)
                        const { error: sponsorUpdateError } = await supabase
                            .from("profiles")
                            .update({
                                balance: newBalance,
                                direct_bonus: newDirectBonus,
                            })
                            .eq("id", sponsorId);

                        if (!sponsorUpdateError) {
                            // Registra a transação de ganho no histórico (tabela earnings)
                            await supabase
                                .from("earnings")
                                .insert({
                                    user_id: sponsorId,
                                    amount: commissionAmount,
                                    description:
                                        `Bônus de Indicação Direta - Adesão R$ ${
                                            amount.toFixed(2)
                                        }`,
                                    created_at: new Date().toISOString(),
                                });

                            console.log(
                                `💰 Comissão de R$ ${
                                    commissionAmount.toFixed(2)
                                } paga para o patrocinador ${sponsorId}`,
                            );
                        } else {
                            console.error(
                                "❌ Asaas Webhook: Erro ao atualizar saldo do patrocinador",
                                sponsorUpdateError,
                            );
                        }
                    }
                }
            }
        }

        // O webhook do Asaas exige sempre retorno HTTP 200 OK para parar de tentar enviar
        return res.status(200).send("OK");
    } catch (error: any) {
        console.error("❌ Erro no Webhook Asaas:", error.message);
        return res.status(200).send("OK");
    }
};
