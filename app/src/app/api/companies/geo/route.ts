import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { parseFilters } from "@/lib/filters";
import { searchCompanies } from "@/lib/queries/companies";

const STATUS = { novo: 0, prospectado: 1, descartado: 2 } as Record<string, number>;

// Formato compacto: [id, lng, lat, score, status]. O cliente monta o GeoJSON.
export const GET = withSession(async (s, req) => {
  const f = parseFilters(new URL(req.url).searchParams);
  const { all, total, scoreKey } = await searchCompanies(s.orgId, f);
  const points = all
    .filter((r) => r.lat !== null && r.lng !== null)
    .map((r) => [r.id, Math.round(r.lng! * 1e5) / 1e5, Math.round(r.lat! * 1e5) / 1e5, r.scores[scoreKey], STATUS[r.status] ?? 0]);
  return NextResponse.json({ total, scoreKey, points });
});
