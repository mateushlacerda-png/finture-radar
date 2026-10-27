import { SETORES } from "@/lib/cnaes";
import { FAIXAS_FUNCIONARIOS, PORTES, REGIOES, SOLUCOES } from "@/lib/domain";
import { parseFilters } from "@/lib/filters";

/** Resumo legível de uma querystring de filtros, para listas de pesquisas salvas. */
export function describeQuery(query: string): string {
  const f = parseFilters(new URLSearchParams(query));
  const parts: string[] = [];
  if (f.tipo) parts.push(f.tipo === "parceiro" ? "Parceiros" : "Clientes finais");
  if (f.solucao) parts.push(SOLUCOES[f.solucao as keyof typeof SOLUCOES].label);
  if (f.scoreMin) parts.push(`score ${f.scoreMin}+`);
  if (f.regiao) parts.push(REGIOES[f.regiao].label);
  if (f.uf.length) parts.push(f.uf.join(", "));
  if (f.municipio) parts.push(f.municipio);
  if (f.setor) parts.push(SETORES[f.setor as keyof typeof SETORES]);
  if (f.cnae) parts.push(`CNAE ${f.cnae}`);
  if (f.porte.length) parts.push(f.porte.map((p) => (p === "DEMAIS" ? "médio/grande" : PORTES[p] === PORTES.NI ? "porte n/i" : p)).join("/"));
  if (f.func.length) parts.push(`${f.func.map((x) => FAIXAS_FUNCIONARIOS[x]).join(", ")} func.`);
  if (f.idadeMin !== undefined || f.idadeMax !== undefined) parts.push(`${f.idadeMin ?? 0} a ${f.idadeMax ?? "∞"} anos`);
  if (f.contato) parts.push("com contato");
  if (f.recentes) parts.push("novas na base");
  if (f.q) parts.push(`"${f.q}"`);
  return parts.join(" · ") || "Sem filtros";
}
