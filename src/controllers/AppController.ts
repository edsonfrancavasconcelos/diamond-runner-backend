import { Request, Response } from 'express';
import { supabase } from '../services/supabase.js';
import { getCache, setCache } from '../utils/cache.js';

export class AppController {
  static async list(req: Request, res: Response) {
    try {
      const user = (req as any).user;

      const cacheKey = `apps_${user.id}`;

      // 🔥 1️⃣ Verifica cache primeiro
      const cachedApps = getCache(cacheKey);
      if (cachedApps) {
        return res.json(cachedApps);
      }

      // 🔹 2️⃣ Buscar plano ativo
      const { data: plan, error: planError } = await supabase
        .from('user_plan')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (planError || !plan) {
        return res.json([]);
      }

      // 🔹 3️⃣ Buscar apps liberados
      const { data: apps, error } = await supabase
        .from('plan_apps')
        .select(`
          app_slug,
          apps (*)
        `)
        .eq('plan_id', plan.plan_id);

      if (error) {
        return res.status(500).json({ error: 'Erro ao buscar apps' });
      }

      const result = (apps ?? []).map((a: any) => a.apps);

      // 🔥 4️⃣ Salva no cache por 30 segundos
      setCache(cacheKey, result, 30);

      return res.json(result);

    } catch (err) {
      return res.status(500).json({ error: 'Erro ao listar apps' });
    }
  }
}
