import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/token.service.js';
import { supabase } from '../services/supabase.js';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Token não enviado' });
    }

    const token = authHeader.replace('Bearer ', '');

    // ✅ 1️⃣ tenta token interno primeiro
    try {
      const decoded = verifyToken(token);
      (req as any).user = decoded;
      return next();
    } catch {}

    // ✅ 2️⃣ fallback Supabase (login antigo)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Usuário inválido' });
    }

    (req as any).user = user;

    next();
  } catch {
    return res.status(401).json({ error: 'Falha na autenticação' });
  }
}
