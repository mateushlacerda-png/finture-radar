import "server-only";

// Resultado ordenado de uma busca do Radar, guardado por poucos segundos: a lista e o mapa pedem a mesma
// busca ao mesmo tempo e, com mais de 500 mil empresas, refazer o trabalho custava segundos.
// Toda action bem-sucedida limpa o cache (lib/actions/_util.ts), então descarte, CRM e listas aparecem na hora.
export const RANKING_TTL_MS = 5_000;

const g = globalThis as unknown as { __radarRankings?: Map<string, { at: number; p: Promise<unknown> }> };
export const rankings = (g.__radarRankings ??= new Map());

export function invalidateRankings() {
  rankings.clear();
}
