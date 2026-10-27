import { ADERENCIA_SETOR, SETORES, TIPOS_PARCEIRO, cnaeInfo } from "@/lib/cnaes";
import { FAIXAS_FUNCIONARIOS, PORTES, SOLUCOES, SOLUCAO_KEYS, type FaixaFuncionarios, type Porte, type Solucao } from "@/lib/domain";
import { CRITERIA_LABELS, type Weights } from "./weights";
import { fantasiaValida } from "@/lib/nome";

// Origem do dado usado em cada critério. "premissa" = hipótese comercial calibrável, não fato.
export type Origin = "receita" | "enriquecimento" | "demo" | "premissa" | "calculado" | "ausente";

export type Criterion = {
  key: string;
  label: string;
  weight: number;
  points: number; // 0..1
  evidence: string;
  origin: Origin;
  isEstimate: boolean;
};

export type Confidence = "alta" | "media" | "baixa";

export type ScoreResult = {
  value: number; // 0..100
  confidence: Confidence;
  criteria: Criterion[];
  note?: string;
};

export type CompanyScores = Record<"geral" | Solucao, ScoreResult>;

export type ScorableCompany = {
  situacao: string;
  cnaePrincipal: string | null;
  porte: string | null;
  capitalSocial: number | null;
  dataAbertura: string | null; // YYYY-MM-DD
  telefone: string | null;
  email: string | null;
  site: string | null;
  nomeFantasia: string | null;
  funcionariosFaixa: string | null;
  geoPrecision: string | null;
  source: string;
};

// Um único formatador: criar Intl.NumberFormat a cada chamada custava ~0,1 ms por empresa.
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRL = (n: number) => BRL.format(n);

export function anosDeAtividade(dataAbertura: string | null, now: Date): number | null {
  if (!dataAbertura) return null;
  const d = new Date(dataAbertura + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

function sourceOrigin(c: ScorableCompany): Origin {
  if (c.source === "demo") return "demo";
  if (c.source === "enriquecimento") return "enriquecimento";
  return "receita";
}

function finalize(criteria: Criterion[], note?: string): ScoreResult {
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return { value: 0, confidence: "baixa", criteria, note };
  const raw = criteria.reduce((s, c) => s + c.weight * c.points, 0) / total;
  const comDado = criteria.filter((c) => c.origin !== "ausente").reduce((s, c) => s + c.weight, 0) / total;
  const confidence: Confidence = comDado >= 0.8 ? "alta" : comDado >= 0.5 ? "media" : "baixa";
  return { value: Math.round(raw * 100), confidence, criteria, note };
}

function crit(key: string, weight: number, points: number, evidence: string, origin: Origin, isEstimate = false): Criterion {
  return { key, label: CRITERIA_LABELS[key] ?? key, weight, points: Math.max(0, Math.min(1, points)), evidence, origin, isEstimate };
}

// ---------- critérios reutilizáveis ----------

function cPorte(c: ScorableCompany, weight: number, scale: Record<Porte, number>): Criterion {
  const p = (c.porte ?? "NI") as Porte;
  if (p === "NI" || !(p in PORTES)) return crit("porte", weight, 0, "Porte não informado no cadastro", "ausente");
  return crit("porte", weight, scale[p], `Porte no cadastro: ${PORTES[p]}`, sourceOrigin(c));
}

function cTempo(c: ScorableCompany, weight: number, now: Date): Criterion {
  const anos = anosDeAtividade(c.dataAbertura, now);
  if (anos === null) return crit("tempo", weight, 0, "Data de abertura não informada", "ausente");
  const pts = anos < 1 ? 0.2 : anos < 3 ? 0.6 : anos < 10 ? 0.9 : 1;
  const txt = anos < 1 ? "menos de 1 ano" : `${Math.floor(anos)} ${Math.floor(anos) === 1 ? "ano" : "anos"}`;
  return crit("tempo", weight, pts, `Em atividade há ${txt}`, sourceOrigin(c));
}

function cContato(c: ScorableCompany, weight: number): Criterion {
  const canais = [c.telefone && "telefone", c.email && "e-mail"].filter(Boolean) as string[];
  if (canais.length === 0) return crit("contato", weight, 0, "Sem telefone ou e-mail cadastral", "ausente");
  return crit("contato", weight, canais.length === 2 ? 1 : 0.7, `Contato cadastral: ${canais.join(" e ")}`, sourceOrigin(c));
}

function cCapital(c: ScorableCompany, weight: number): Criterion {
  const v = c.capitalSocial;
  if (v === null || v === undefined || v <= 0) return crit("capital", weight, 0, "Capital social não informado", "ausente");
  const pts = v < 50_000 ? 0.3 : v < 500_000 ? 0.6 : v < 5_000_000 ? 0.9 : 1;
  return crit("capital", weight, pts, `Capital social declarado: ${fmtBRL(v)}`, sourceOrigin(c));
}

function cSetor(c: ScorableCompany, weight: number, sol: "saude" | "seguro" | "credito"): Criterion {
  const info = cnaeInfo(c.cnaePrincipal);
  if (!info) return crit("setor", weight, 0, "CNAE fora do catálogo do Radar", "ausente");
  const v = ADERENCIA_SETOR[info.setor][sol];
  const nivel = v >= 0.85 ? "alta" : v >= 0.6 ? "média" : "baixa";
  return crit("setor", weight, v, `Setor ${SETORES[info.setor]}: aderência ${nivel} (premissa comercial)`, "premissa");
}

function cFuncionarios(c: ScorableCompany, weight: number): Criterion {
  const f = c.funcionariosFaixa as FaixaFuncionarios | null;
  if (!f || !(f in FAIXAS_FUNCIONARIOS)) return crit("funcionarios", weight, 0, "Sem estimativa de funcionários", "ausente", true);
  const pts: Record<FaixaFuncionarios, number> = { "1-4": 0.15, "5-9": 0.45, "10-49": 0.8, "50-99": 1, "100+": 1 };
  const origin: Origin = c.source === "demo" ? "demo" : "enriquecimento";
  return crit("funcionarios", weight, pts[f], `Faixa estimada: ${FAIXAS_FUNCIONARIOS[f]} funcionários`, origin, true);
}

// ---------- scores por solução ----------

export function scoreSaude(c: ScorableCompany, w: Weights["saude"], now: Date): ScoreResult {
  return finalize([
    cFuncionarios(c, w.funcionarios),
    cPorte(c, w.porte, { ME: 0.3, EPP: 0.7, DEMAIS: 1, NI: 0 }),
    cSetor(c, w.setor, "saude"),
    cTempo(c, w.tempo, now),
    cContato(c, w.contato),
  ]);
}

export function scoreSeguro(c: ScorableCompany, w: Weights["seguro"], now: Date): ScoreResult {
  return finalize([
    cSetor(c, w.setor, "seguro"),
    cPorte(c, w.porte, { ME: 0.35, EPP: 0.7, DEMAIS: 1, NI: 0 }),
    cCapital(c, w.capital),
    cTempo(c, w.tempo, now),
    cContato(c, w.contato),
  ]);
}

export function scoreCredito(c: ScorableCompany, w: Weights["credito"], now: Date): ScoreResult {
  return finalize(
    [
      cTempo(c, w.tempo, now),
      cPorte(c, w.porte, { ME: 0.4, EPP: 0.75, DEMAIS: 1, NI: 0 }),
      cSetor(c, w.setor, "credito"),
      cCapital(c, w.capital),
      cContato(c, w.contato),
    ],
    "Mede compatibilidade com soluções de crédito. Não indica necessidade financeira nem capacidade de pagamento.",
  );
}

export function scoreParceria(c: ScorableCompany, w: Weights["parceria"], now: Date): ScoreResult {
  const info = cnaeInfo(c.cnaePrincipal);
  const tipo = info?.parceria ? TIPOS_PARCEIRO[info.parceria] : undefined;
  const cTipo = tipo
    ? crit("tipo", w.tipo, tipo.aderencia, `${tipo.label}. ${tipo.nota}`, "premissa")
    : crit("tipo", w.tipo, 0, info ? "Atividade principal não é de distribuição financeira ou imobiliária" : "CNAE fora do catálogo do Radar", info ? "premissa" : "ausente");
  const digital = c.site
    ? crit("digital", w.digital, 1, `Site informado: ${c.site}`, c.source === "demo" ? "demo" : "enriquecimento")
    : crit("digital", w.digital, 0, "Sem site identificado", "ausente");
  const result = finalize([
    cTipo,
    cPorte(c, w.porte, { ME: 0.5, EPP: 0.9, DEMAIS: 1, NI: 0 }),
    cTempo(c, w.tempo, now),
    digital,
    cContato(c, w.contato),
  ]);
  // Sem perfil de distribuição, os outros critérios não fazem a empresa virar parceira.
  if (!tipo) result.value = Math.min(result.value, 20);
  return result;
}

export function qualidadeDoDado(c: ScorableCompany): { points: number; faltando: string[] } {
  const campos: [string, boolean][] = [
    ["nome fantasia", !!fantasiaValida(c.nomeFantasia)],
    ["CNAE", !!c.cnaePrincipal],
    ["porte", !!c.porte && c.porte !== "NI"],
    ["data de abertura", !!c.dataAbertura],
    ["capital social", !!c.capitalSocial],
    ["telefone", !!c.telefone],
    ["e-mail", !!c.email],
    ["site", !!c.site],
    ["localização precisa", c.geoPrecision === "endereco" || c.geoPrecision === "cep"],
  ];
  const faltando = campos.filter(([, ok]) => !ok).map(([n]) => n);
  return { points: (campos.length - faltando.length) / campos.length, faltando };
}

export function scoreCompany(c: ScorableCompany, weights: Weights, now = new Date()): CompanyScores {
  const ativa = c.situacao.toUpperCase() === "ATIVA";
  const parts = {
    saude: scoreSaude(c, weights.saude, now),
    seguro: scoreSeguro(c, weights.seguro, now),
    credito: scoreCredito(c, weights.credito, now),
    parceria: scoreParceria(c, weights.parceria, now),
  };

  const best = SOLUCAO_KEYS.reduce((a, b) => (parts[b].value > parts[a].value ? b : a), "saude" as Solucao);
  const q = qualidadeDoDado(c);
  const gw = weights.geral;
  const geral = finalize([
    crit("aderencia", gw.aderencia, parts[best].value / 100, `Melhor solução: ${SOLUCOES[best].label} (${parts[best].value})`, "calculado"),
    crit(
      "qualidade",
      gw.qualidade,
      q.points,
      q.faltando.length ? `Faltam: ${q.faltando.join(", ")}` : "Cadastro completo",
      "calculado",
    ),
    cPorte(c, gw.porte, { ME: 0.2, EPP: 0.6, DEMAIS: 1, NI: 0 }),
  ]);
  // Confiança do geral herda a da melhor solução: qualidade e aderência são calculadas, não observadas.
  geral.confidence = parts[best].confidence;

  if (!ativa) {
    const note = `Situação cadastral ${c.situacao}: empresa não pode ser abordada.`;
    for (const r of [geral, ...Object.values(parts)]) {
      r.value = 0;
      r.note = note;
    }
  }
  return { geral, ...parts };
}

export function solucoesRecomendadas(s: CompanyScores, min = 60): Solucao[] {
  return SOLUCAO_KEYS.filter((k) => s[k].value >= min).sort((a, b) => s[b].value - s[a].value);
}

/**
 * Chave de perfil: tudo o que muda os NÚMEROS de scoreCompany (valores, confiança, recomendadas).
 * Empresas com o mesmo perfil têm o mesmo score; com 500 mil empresas e poucos milhares de perfis,
 * o Radar calcula uma vez por perfil. Ao mudar um critério acima, atualize esta chave
 * (tests/unit/scoring-perfil.test.ts compara as duas coisas e quebra se divergirem).
 */
export function perfilDoScore(c: ScorableCompany, now: Date): string {
  const anos = anosDeAtividade(c.dataAbertura, now);
  const tempo = anos === null ? "n" : anos < 1 ? "0" : anos < 3 ? "1" : anos < 10 ? "2" : "3";
  const v = c.capitalSocial;
  const capital = v === null || v === undefined ? "n" : v === 0 ? "z" : v < 0 ? "neg" : v < 50_000 ? "0" : v < 500_000 ? "1" : v < 5_000_000 ? "2" : "3";
  return [
    c.situacao.toUpperCase() === "ATIVA" ? "A" : "I",
    c.cnaePrincipal ?? "",
    c.porte ?? "",
    c.funcionariosFaixa ?? "",
    tempo,
    c.dataAbertura ? 1 : 0,
    capital,
    c.telefone ? 1 : 0,
    c.email ? 1 : 0,
    c.site ? 1 : 0,
    fantasiaValida(c.nomeFantasia) ? 1 : 0,
    c.geoPrecision === "endereco" || c.geoPrecision === "cep" ? 1 : 0,
    c.source,
  ].join("|");
}
