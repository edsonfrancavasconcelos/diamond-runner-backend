import jwt from 'jsonwebtoken';

interface Payload {
  user_id: string;
  email: string;
  plan_id: string | null;
}

export function generateToken(payload: Payload) {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string) {
  return jwt.verify(token, process.env.JWT_SECRET as string);
}
