// Vocabulário de negócio do Finture Radar. Tudo que aparece em filtro, score e CRM sai daqui.

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
export type UF = (typeof UFS)[number];

export const REGIOES: Record<string, { label: string; ufs: UF[] }> = {
  norte: { label: "Norte", ufs: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"] },
  nordeste: { label: "Nordeste", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  "centro-oeste": { label: "Centro-Oeste", ufs: ["DF", "GO", "MT", "MS"] },
  sudeste: { label: "Sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
  sul: { label: "Sul", ufs: ["PR", "RS", "SC"] },
};

// Porte conforme o cadastro da Receita (ME, EPP, Demais). NI = não informado.
export const PORTES = {
  ME: "Microempresa",
  EPP: "Empresa de pequeno porte",
  DEMAIS: "Demais (médio e grande)",
  NI: "Não informado",
} as const;
export type Porte = keyof typeof PORTES;

// Faixas de funcionários. Não há fonte pública por empresa: o campo é sempre estimativa.
export const FAIXAS_FUNCIONARIOS = {
  "1-4": "1 a 4",
  "5-9": "5 a 9",
  "10-49": "10 a 49",
  "50-99": "50 a 99",
  "100+": "100 ou mais",
} as const;
export type FaixaFuncionarios = keyof typeof FAIXAS_FUNCIONARIOS;

export const SOLUCOES = {
  saude: { label: "Saúde empresarial", curto: "Saúde", desc: "Planos de saúde coletivos e benefícios" },
  seguro: { label: "Seguro empresarial", curto: "Seguro", desc: "Patrimonial, responsabilidade civil e corporativo" },
  credito: { label: "Crédito", curto: "Crédito", desc: "Crédito empresarial, financiamento e consórcio" },
  parceria: { label: "Parceria white-label", curto: "Parceria", desc: "Distribuição das soluções Finture com a marca do parceiro" },
} as const;
export type Solucao = keyof typeof SOLUCOES;
export const SOLUCAO_KEYS = Object.keys(SOLUCOES) as Solucao[];

export type ScoreKey = "geral" | Solucao;
export const SCORE_LABELS: Record<ScoreKey, string> = {
  geral: "Geral",
  saude: SOLUCOES.saude.curto,
  seguro: SOLUCOES.seguro.curto,
  credito: SOLUCOES.credito.curto,
  parceria: SOLUCOES.parceria.curto,
};

export const FUNIS = {
  parceiro: "Parceiros de distribuição",
  cliente: "Clientes finais",
} as const;
export type Funil = keyof typeof FUNIS;

export const ETAPAS = [
  { key: "lead_identificado", label: "Lead identificado" },
  { key: "lead_qualificado", label: "Lead qualificado" },
  { key: "primeiro_contato", label: "Primeiro contato" },
  { key: "reuniao_agendada", label: "Reunião agendada" },
  { key: "diagnostico", label: "Diagnóstico realizado" },
  { key: "proposta_enviada", label: "Proposta enviada" },
  { key: "negociacao", label: "Negociação" },
  { key: "ganho", label: "Ganho" },
  { key: "perdido", label: "Perdido" },
] as const;
export type Etapa = (typeof ETAPAS)[number]["key"];
export const ETAPA_KEYS = ETAPAS.map((e) => e.key) as Etapa[];
export const ETAPAS_ABERTAS: Etapa[] = ETAPA_KEYS.filter((k) => k !== "ganho" && k !== "perdido");
export const etapaIndex = (e: Etapa) => ETAPA_KEYS.indexOf(e);
export const etapaLabel = (e: string) => ETAPAS.find((x) => x.key === e)?.label ?? e;

export const ROLES = { admin: "Admin", gestor: "Gestor comercial", executivo: "Executivo comercial" } as const;
export type Role = keyof typeof ROLES;

export const STATUS_EMPRESA = { novo: "Novo", prospectado: "Prospectado", descartado: "Descartado" } as const;
export type StatusEmpresa = keyof typeof STATUS_EMPRESA;

export const TIPOS_ATIVIDADE = {
  nota: "Nota",
  ligacao: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  etapa: "Mudança de etapa",
  tarefa: "Tarefa",
  sistema: "Sistema",
} as const;
export type TipoAtividade = keyof typeof TIPOS_ATIVIDADE;
export const TIPOS_CONTATO: TipoAtividade[] = ["ligacao", "email", "whatsapp", "reuniao"];

export const MOTIVOS_DESCARTE = [
  "Fora do perfil (ICP)",
  "Empresa inativa ou em encerramento",
  "Já é parceiro ou cliente",
  "Sem interesse declarado",
  "Dado cadastral incorreto",
  "Outro",
] as const;

/** Atividades de etapa são gravadas como "Etapa: <chave>[. Motivo: ...]"; aqui viram texto legível. */
export function formatActivityBody(type: string, body: string): string {
  if (type !== "etapa" || !body.startsWith("Etapa: ")) return body;
  const rest = body.slice(7);
  const i = rest.indexOf(". ");
  const key = i === -1 ? rest : rest.slice(0, i);
  if (key === "lead_identificado") return "Entrou no funil como Lead identificado";
  return `Movida para ${etapaLabel(key)}${i === -1 ? "" : rest.slice(i)}`;
}
