import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { parseFilters } from "@/lib/filters";
import { searchCompanies } from "@/lib/queries/companies";

export const GET = withSession(async (s, req) => {
  const url = new URL(req.url);
  const f = parseFilters(url.searchParams);
  const page = Math.max(0, Math.min(1000, Number(url.searchParams.get("page") ?? 0) || 0));
  const size = 40;
  const { total, rows, scoreKey } = await searchCompanies(s.orgId, f, { offset: page * size, limit: size });
  return NextResponse.json({ total, page, size, scoreKey, rows });
});
