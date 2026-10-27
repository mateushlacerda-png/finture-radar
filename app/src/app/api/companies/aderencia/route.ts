import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { SOLUCAO_KEYS } from "@/lib/domain";
import { parseFilters } from "@/lib/filters";
import { searchCompanies } from "@/lib/queries/companies";

// Aderência da base às soluções (Dashboard) e distribuição por faixa de score (Configurações). Fica na API porque precisa da base em memória, que a API
// já mantém aquecida para o Radar; a página do Dashboard não carrega a base.
export const GET = withSession(async (s) => {
  const { ranked } = await searchCompanies(s.orgId, parseFilters({}));
  const aderencia = SOLUCAO_KEYS.map((k) => {
    let empresas = 0;
    let fortes = 0;
    for (const x of ranked) {
      const v = x.s.scores[k];
      if (v >= 60) empresas++;
      if (v >= 80) fortes++;
    }
    return { solucao: k, empresas, fortes };
  });
  // Faixas até 39, 40 a 59, 60 a 79 e 80+ para cada score, com os pesos atuais.
  const faixas = Object.fromEntries(
    (["geral", ...SOLUCAO_KEYS] as const).map((k) => {
      const f = [0, 0, 0, 0];
      for (const x of ranked) {
        const v = x.s.scores[k];
        f[v < 40 ? 0 : v < 60 ? 1 : v < 80 ? 2 : 3]++;
      }
      return [k, f];
    }),
  );
  return NextResponse.json({ aderencia, faixas });
});
