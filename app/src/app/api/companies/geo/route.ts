import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { parseFilters } from "@/lib/filters";
import { searchCompanies } from "@/lib/queries/companies";

const STATUS = { novo: 0, prospectado: 1, descartado: 2 } as Record<string, number>;
// Acima disso o navegador demora a desenhar; vão os de maior score (o resultado já vem ordenado)
// e a tela avisa. A lista e a contagem continuam completas.
const MAPA_MAX = 120_000;

// Formato compacto: [id, lng, lat, score, status]. O cliente monta o GeoJSON.
export const GET = withSession(async (s, req) => {
  const f = parseFilters(new URL(req.url).searchParams);
  const { ranked, total, scoreKey } = await searchCompanies(s.orgId, f);
  // JSON montado à mão a partir do trecho "id,lng,lat" guardado na base: com 500 mil pontos,
  // criar arrays e passar por JSON.stringify custava mais de um segundo.
  const partes: string[] = [];
  for (const x of ranked) {
    if (partes.length >= MAPA_MAX) break;
    if (x.r.geo) partes.push(`[${x.r.geo},${x.s.scores[scoreKey]},${STATUS[x.status ?? "novo"] ?? 0}]`);
  }
  const limitado = partes.length >= MAPA_MAX && total > MAPA_MAX;
  return new NextResponse(`{"total":${total},"scoreKey":"${scoreKey}","limitado":${limitado},"points":[${partes.join(",")}]}`, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
