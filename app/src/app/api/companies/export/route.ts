import { withSession } from "@/lib/api";
import { parseFilters } from "@/lib/filters";
import { searchCompanies } from "@/lib/queries/companies";
import { audit } from "@/lib/actions/_util";
import { PORTES, SCORE_LABELS, SOLUCOES, STATUS_EMPRESA, type Solucao } from "@/lib/domain";

// Neutraliza injeção de fórmula em planilha (=, +, -, @) e escapa aspas.
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = withSession(async (s, req) => {
  const f = parseFilters(new URL(req.url).searchParams);
  const { all } = await searchCompanies(s.orgId, f);
  const head = [
    "CNPJ", "Nome", "Razão social", "UF", "Município", "Porte", "CNAE", "Setor", "Status", "Telefone", "E-mail", "Site",
    ...Object.values(SCORE_LABELS).map((l) => `Score ${l}`), "Confiança", "Soluções recomendadas", "Dado simulado",
  ];
  const lines = all.map((r) =>
    [
      r.cnpj, r.nome, r.razaoSocial, r.uf, r.municipio, PORTES[(r.porte ?? "NI") as keyof typeof PORTES] ?? r.porte,
      r.cnae, r.setor, STATUS_EMPRESA[r.status as keyof typeof STATUS_EMPRESA] ?? r.status,
      r.telefone ?? "Não consta", r.email ?? "Não consta", r.site ?? "Não consta",
      r.scores.geral, r.scores.saude, r.scores.seguro, r.scores.credito, r.scores.parceria, r.confianca,
      r.recomendadas.map((k) => SOLUCOES[k as Solucao].label).join(" | "), r.isDemo ? "SIM" : "NÃO",
    ].map(cell).join(";"),
  );
  await audit(s, "exportar_csv", "companies", null, { linhas: all.length, filtros: f });
  // BOM + ; para abrir certo no Excel em pt-BR.
  const body = "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finture-radar-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
