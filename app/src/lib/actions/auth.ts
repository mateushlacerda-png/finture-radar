"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha.").max(200),
  next: z.string().optional(),
});

export async function loginAction(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  // Mesma mensagem para usuário inexistente e senha errada.
  if (!u || !(await verifyPassword(parsed.data.password, u.passwordHash))) {
    return { error: "E-mail ou senha incorretos." };
  }
  await createSession(u.id);
  const next = parsed.data.next;
  // Só aceita caminho interno, para não virar open redirect.
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
