import { cnaeInfo, TIPOS_PARCEIRO } from "@/lib/cnaes";
import { NATUREZAS } from "@/lib/naturezas";
import { anosDeAtividade } from "@/lib/scoring/engine";
import { nomeExibicao } from "@/lib/nome";

// Overview factual: só junta o que está no cadastro e o que a empresa publica sobre si.
// Nada aqui é inferido; a camada de IA (src/lib/ai/overview.ts) é separada e marcada como tal.

export type OverviewInput = {
  razaoSocial: string;
  nomeFantasia: string | null;
  cnaePrincipal: string | null;
  cnaesSecundarios: string[];
  naturezaJuridica: string | null;
  porte: string | null;
  capitalSocial: number | null;
  dataAbertura: string | null;
  bairro: string | null;
  municipio: string;
  uf: string;
  siteDescricao: string | null;
  sourceRef: string | null;
  isDemo: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export function factualOverview(c: OverviewInput, now = new Date()): { paragrafos: string[]; fontes: string[] } {
  const nome = titulo(nomeExibicao(c));
  const info = cnaeInfo(c.cnaePrincipal);
  const minuscula = (s: string) => s[0].toLowerCase() + s.slice(1);
  const atividade = info
    ? info.parceria
      ? `atua como ${minuscula(TIPOS_PARCEIRO[info.parceria].label)} (CNAE ${info.code}, ${info.descricao.toLowerCase()})`
      : `atua em ${info.descricao.toLowerCase()} (CNAE ${info.code})`
    : c.cnaePrincipal
      ? `tem CNAE principal ${c.cnaePrincipal}`
      : "não tem atividade principal identificada no catálogo";
  const local = [c.bairro ? titulo(c.bairro) : null, `${c.municipio}/${c.uf}`].filter(Boolean).join(", ");

  const p1 = `${nome} ${atividade}, com sede em ${local}.`;
  const partes: string[] = [];
  const anos = anosDeAtividade(c.dataAbertura, now);
  if (anos !== null && c.dataAbertura) {
    const n = Math.floor(anos);
    partes.push(n >= 1 ? `está em atividade há ${n} ${n === 1 ? "ano" : "anos"} (aberta em ${c.dataAbertura.slice(0, 4)})` : `foi aberta há menos de um ano`);
  }
  const PORTE_FRASE: Record<string, string> = { ME: "é microempresa", EPP: "é empresa de pequeno porte", DEMAIS: "é de médio ou grande porte" };
  if (c.porte && PORTE_FRASE[c.porte]) partes.push(`${PORTE_FRASE[c.porte]} no cadastro`);
  if (c.capitalSocial) partes.push(`declara capital social de ${BRL.format(c.capitalSocial)}`);
  if (c.naturezaJuridica && NATUREZAS[c.naturezaJuridica]) partes.push(`tem natureza jurídica de ${NATUREZAS[c.naturezaJuridica].toLowerCase()}`);
  const p2 = partes.length ? `A empresa ${partes.join(", ").replace(/, ([^,]*)$/, " e $1")}.` : null;

  const secundarias = c.cnaesSecundarios.map((s) => cnaeInfo(s)?.descricao.toLowerCase()).filter(Boolean) as string[];
  const p3 = secundarias.length ? `Também registra atividades de ${secundarias.slice(0, 3).join("; ")}${secundarias.length > 3 ? " e outras" : ""}.` : null;

  const p4 = c.siteDescricao ? `No próprio site, a empresa se apresenta assim: “${c.siteDescricao}”` : null;

  const fontes = [c.isDemo ? "Cadastro simulado (demonstração)" : (c.sourceRef ?? "Cadastro CNPJ da Receita Federal")];
  if (c.siteDescricao) fontes.push("Descrição publicada no site da empresa");
  return { paragrafos: [p1, p2, p3, p4].filter((x): x is string => !!x), fontes };
}
