import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { getCompanyDetail } from "@/lib/queries/companies";

export const GET = withSession(async (s, _req, ctx) => {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  const detail = await getCompanyDetail(s.orgId, n);
  if (!detail) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  return NextResponse.json(detail);
});
