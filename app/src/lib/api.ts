import "server-only";
import { NextResponse } from "next/server";
import { AuthError, requireApiSession, type Session } from "@/lib/auth/session";

/** Route handler autenticado: sessão validada no banco e erros sem detalhe interno. */
export function withSession(handler: (s: Session, req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const s = await requireApiSession();
      return await handler(s, req, ctx);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error("[api]", e);
      return NextResponse.json({ error: "Erro ao carregar os dados." }, { status: 500 });
    }
  };
}
