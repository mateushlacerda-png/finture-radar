import { z } from "zod";
import { FAIXAS_FUNCIONARIOS, PORTES, REGIOES, SOLUCAO_KEYS, UFS } from "@/lib/domain";
import { SETORES } from "@/lib/cnaes";

// Filtros do Radar. A URL é a fonte de verdade: o mesmo objeto alimenta mapa, lista, CSV e pesquisa salva.

const csv = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter((x): x is T => (allowed as readonly string[]).includes(x)) : []));

const int = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined || s === "") return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : undefined;
    });

export const filtersSchema = z.object({
  q: z.string().max(120).optional().transform((s) => s?.trim() || undefined),
  uf: csv(UFS),
  regiao: z.enum(Object.keys(REGIOES) as [string, ...string[]]).optional().catch(undefined),
  municipio: z.string().max(80).optional().transform((s) => s?.trim() || undefined),
  setor: z.enum(Object.keys(SETORES) as [string, ...string[]]).optional().catch(undefined),
  cnae: z.string().regex(/^\d{4}-\d\/\d{2}$/).optional().catch(undefined),
  porte: csv(Object.keys(PORTES) as (keyof typeof PORTES)[]),
  func: csv(Object.keys(FAIXAS_FUNCIONARIOS) as (keyof typeof FAIXAS_FUNCIONARIOS)[]),
  idadeMin: int(0, 100),
  idadeMax: int(0, 100),
  scoreMin: int(0, 100),
  solucao: z.enum(SOLUCAO_KEYS as [string, ...string[]]).optional().catch(undefined),
  tipo: z.enum(["parceiro", "cliente"]).optional().catch(undefined),
  status: z.enum(["ativos", "novo", "prospectado", "descartado", "todos"]).optional().catch(undefined),
  contato: z.enum(["1"]).optional().catch(undefined),
  /** Só as empresas que entraram na última atualização mensal da Receita. */
  recentes: z.enum(["1"]).optional().catch(undefined),
  lista: z.string().uuid().optional().catch(undefined),
});

export type Filters = z.output<typeof filtersSchema>;
export type ScoreSort = "geral" | (typeof SOLUCAO_KEYS)[number];

export function parseFilters(input: URLSearchParams | Record<string, string | string[] | undefined>): Filters {
  const obj: Record<string, string> = {};
  if (input instanceof URLSearchParams) {
    input.forEach((v, k) => (obj[k] = v));
  } else {
    for (const [k, v] of Object.entries(input)) if (typeof v === "string") obj[k] = v;
      else if (Array.isArray(v) && v[0]) obj[k] = v[0];
  }
  const parsed = filtersSchema.safeParse(obj);
  return parsed.success ? parsed.data : filtersSchema.parse({});
}

export function serializeFilters(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","));
    } else p.set(k, String(v));
  }
  return p.toString();
}

export const scoreKeyOf = (f: Filters): ScoreSort => (f.solucao as ScoreSort) ?? (f.tipo === "parceiro" ? "parceria" : "geral");

export function countActive(f: Filters): number {
  let n = 0;
  for (const [k, v] of Object.entries(f)) {
    if (k === "lista") continue;
    if (Array.isArray(v) ? v.length : v !== undefined) n++;
  }
  return n;
}
