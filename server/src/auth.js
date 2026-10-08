import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './draw.js';

const TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'admin';
const sign = value => createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('base64url');
const digest = value => createHash('sha256').update(String(value)).digest();
const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });

export function login(req, res) {
  const password = req.body?.password;
  if (typeof password !== 'string' || !timingSafeEqual(digest(password), digest(process.env.ADMIN_PASSWORD))) {
    throw new HttpError(401, 'Wrong password');
  }
  const expires = String(Date.now() + TTL_MS);
  res.cookie(COOKIE, `${expires}.${sign(expires)}`, { ...cookieOptions(), maxAge: TTL_MS });
  res.json({ admin: true });
}

export function logout(req, res) {
  res.clearCookie(COOKIE, cookieOptions());
  res.json({ admin: false });
}

// Session = "<expiry>.<hmac(expiry)>" in an httpOnly cookie: nothing to store server-side.
export function isAdmin(req) {
  const raw = req.headers.cookie?.match(/(?:^|;\s*)admin=([^;]+)/)?.[1];
  const [expires, sig] = raw?.split('.') ?? [];
  if (!expires || !sig) return false;
  const expected = Buffer.from(sign(expires));
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), expected) && Number(expires) > Date.now();
}

export const requireAdmin = (req, res, next) => next(isAdmin(req) ? undefined : new HttpError(401, 'Admin login required'));

// ponytail: in-memory per-IP limiter; fine for one server instance.
const attempts = new Map();
export function loginLimiter(req, res, next) {
  const now = Date.now();
  const entry = attempts.get(req.ip);
  if (!entry || entry.reset < now) attempts.set(req.ip, { count: 1, reset: now + 15 * 60 * 1000 });
  else if (++entry.count > 10) return next(new HttpError(429, 'Too many login attempts — wait 15 minutes'));
  next();
}
