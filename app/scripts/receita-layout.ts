/**
 * Layout dos arquivos de Dados Abertos do CNPJ (Receita Federal): CSV sem cabeçalho,
 * separador ";", campos entre aspas, codificação latin1. Posições conforme o dicionário
 * de dados publicado pela RFB (Estabelecimentos: 30 colunas; Empresas: 7 colunas).
 * Conferir o dicionário da competência antes de cada ingestão: a RFB pode alterar o layout.
 */

export function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export const SITUACAO: Record<string, string> = { "01": "NULA", "02": "ATIVA", "03": "SUSPENSA", "04": "INAPTA", "08": "BAIXADA" };
export const PORTE: Record<string, string> = { "00": "NI", "01": "ME", "03": "EPP", "05": "DEMAIS" };

const date = (s: string) => (/^\d{8}$/.test(s) && s !== "00000000" ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
/** CNAE da Receita vem como 7 dígitos ("6612605"); o catálogo usa "6612-6/05". */
export const fmtCnae = (s: string) => (/^\d{7}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 5)}/${s.slice(5)}` : null);
const phone = (ddd: string, n: string) => (ddd && n ? `(${ddd.replace(/^0+/, "")}) ${n.length > 4 ? n.slice(0, -4) + "-" + n.slice(-4) : n}` : null);
const nul = (s: string) => (s ? s : null);

export type Estabelecimento = {
  cnpjBasico: string;
  cnpj: string;
  nomeFantasia: string | null;
  situacao: string;
  situacaoDesde: string | null;
  dataAbertura: string | null;
  cnaePrincipal: string | null;
  cnaesSecundarios: string[];
  bairro: string | null;
  cep: string | null;
  uf: string;
  municipioCodigo: string;
  telefone: string | null;
  email: string | null;
};

export function parseEstabelecimento(cols: string[]): Estabelecimento | null {
  if (cols.length < 28) return null;
  const [basico, ordem, dv, , fantasia, sit, dataSit, , , , inicio, cnae, cnaesSec, , , , , bairro, cep, uf, mun, ddd1, tel1, ddd2, tel2, , , email] = cols;
  return {
    cnpjBasico: basico,
    cnpj: `${basico}${ordem}${dv}`,
    nomeFantasia: nul(fantasia),
    situacao: SITUACAO[sit] ?? sit,
    situacaoDesde: date(dataSit),
    dataAbertura: date(inicio),
    cnaePrincipal: fmtCnae(cnae),
    cnaesSecundarios: cnaesSec ? cnaesSec.split(",").map(fmtCnae).filter((x): x is string => !!x) : [],
    bairro: nul(bairro),
    cep: cep ? cep.replace(/^(\d{5})(\d{3})$/, "$1-$2") : null,
    uf,
    municipioCodigo: mun,
    telefone: phone(ddd1, tel1) ?? phone(ddd2, tel2),
    email: email ? email.toLowerCase() : null,
  };
}

export type Empresa = { razaoSocial: string; naturezaJuridica: string | null; capitalSocial: number | null; porte: string };

export function parseEmpresa(cols: string[]): [string, Empresa] | null {
  if (cols.length < 6) return null;
  const [basico, razao, natureza, , capital, porte] = cols;
  const cap = capital ? Number(capital.replace(/\./g, "").replace(",", ".")) : NaN;
  return [basico, { razaoSocial: razao, naturezaJuridica: nul(natureza), capitalSocial: Number.isFinite(cap) && cap > 0 ? cap : null, porte: PORTE[porte] ?? "NI" }];
}
