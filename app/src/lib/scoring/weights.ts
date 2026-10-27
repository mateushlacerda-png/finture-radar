import { z } from "zod";

// Pesos por critério de cada score. Valores relativos: o motor normaliza pela soma.
export const DEFAULT_WEIGHTS = {
  saude: { funcionarios: 30, porte: 25, setor: 20, tempo: 15, contato: 10 },
  seguro: { setor: 30, porte: 25, capital: 20, tempo: 15, contato: 10 },
  credito: { tempo: 30, porte: 25, setor: 20, capital: 15, contato: 10 },
  parceria: { tipo: 45, porte: 15, tempo: 15, digital: 15, contato: 10 },
  geral: { aderencia: 50, qualidade: 25, porte: 25 },
} as const;

export type Weights = { [S in keyof typeof DEFAULT_WEIGHTS]: { [C in keyof (typeof DEFAULT_WEIGHTS)[S]]: number } };

export const CRITERIA_LABELS: Record<string, string> = {
  funcionarios: "Funcionários (faixa)",
  porte: "Porte",
  setor: "Aderência do setor",
  tempo: "Tempo de atividade",
  contato: "Contato disponível",
  capital: "Capital social",
  tipo: "Perfil de parceiro",
  digital: "Presença digital",
  aderencia: "Melhor aderência entre as soluções",
  qualidade: "Qualidade do dado",
};

const w = z.number().int().min(0).max(100);
export const weightsSchema = z.object({
  saude: z.object({ funcionarios: w, porte: w, setor: w, tempo: w, contato: w }),
  seguro: z.object({ setor: w, porte: w, capital: w, tempo: w, contato: w }),
  credito: z.object({ tempo: w, porte: w, setor: w, capital: w, contato: w }),
  parceria: z.object({ tipo: w, porte: w, tempo: w, digital: w, contato: w }),
  geral: z.object({ aderencia: w, qualidade: w, porte: w }),
}).refine(
  (v) => Object.values(v).every((group) => Object.values(group).some((n) => n > 0)),
  { message: "Cada score precisa de ao menos um critério com peso maior que zero." },
);

export function mergeWeights(partial: unknown): Weights {
  const base = structuredClone(DEFAULT_WEIGHTS) as unknown as Weights;
  const parsed = weightsSchema.safeParse(partial);
  return parsed.success ? (parsed.data as Weights) : base;
}
