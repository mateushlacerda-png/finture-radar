import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations, sessions, users } from "@/lib/db/schema";
import type { Role } from "@/lib/domain";
import { newToken, sha256 } from "./password";

export const SESSION_COOKIE = "radar_session";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

export type Session = {
  userId: string;
  orgId: string;
  orgName: string;
  name: string;
  email: string;
  role: Role;
};

export async function createSession(userId: string) {
  const db = await getDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Acesso aberto (decisão do usuário em 2026-10-27, até o Radar entrar no hub da Finture):
 * com RADAR_ACESSO_ABERTO = e-mail de um usuário, quem abre o site entra como esse usuário, sem login.
 * Sem a variável, vale o login normal (ambiente local e testes). Na integração com o hub, é aqui que
 * a identidade passa a vir da plataforma.
 */
export const acessoAberto = () => !!process.env.RADAR_ACESSO_ABERTO;

async function sessaoAberta(): Promise<Session | null> {
  const email = process.env.RADAR_ACESSO_ABERTO;
  if (!email) return null;
  const db = await getDb();
  const rows = await db
    .select({ userId: users.id, orgId: users.orgId, orgName: organizations.name, name: users.name, email: users.email, role: users.role })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(eq(users.email, email))
    .limit(1);
  return (rows[0] as Session | undefined) ?? null;
}

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return sessaoAberta();
  const db = await getDb();
  const rows = await db
    .select({
      userId: users.id,
      orgId: users.orgId,
      orgName: organizations.name,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return (rows[0] as Session | undefined) ?? (await sessaoAberta());
});

/** Para páginas: redireciona ao login. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

/** Para actions e route handlers: lança AuthError em vez de redirecionar. */
export async function requireApiSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError(401, "Sessão expirada. Entre novamente.");
  if (roles && !roles.includes(s.role)) throw new AuthError(403, "Seu perfil não tem permissão para esta ação.");
  return s;
}

export const canManage = (s: Session) => s.role === "admin" || s.role === "gestor";
