import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../services/supabase.js';

export class SsoController {
  static async create(req: Request, res: Response) {
    try {
      const { app } = req.body;
      const user = (req as any).user;

      if (!app) {
        return res.status(400).json({ error: 'App não informado' });
      }

      // 1️⃣ Buscar plano ativo
      const { data: userPlan, error: planError } = await supabase
        .from('user_plan')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (planError || !userPlan) {
        return res.status(403).json({ error: 'Plano inválido ou expirado' });
      }

      // 2️⃣ Verificar acesso ao app
      const { data: planApp, error: accessError } = await supabase
        .from('plan_apps')
        .select('*')
        .eq('plan_id', userPlan.plan_id)
        .eq('app_slug', app)
        .single();

      if (accessError || !planApp) {
        return res.status(403).json({ error: 'App não liberado para este plano' });
      }

      // 3️⃣ Criar token SSO (5 min)
      const ssoToken = jwt.sign(
        {
          user_id: user.id,
          email: user.email,
          app
        },
        process.env.JWT_SECRET as string,
        { expiresIn: '5m' }
      );

      return res.json({ token: ssoToken });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno no SSO' });
    }
  }
}
