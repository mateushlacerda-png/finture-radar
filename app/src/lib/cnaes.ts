// Catálogo de CNAEs usados pelo Radar. Códigos e descrições seguem a CNAE 2.3 (IBGE/CONCLA).
// `setor` agrupa para filtro; `parceria` marca o tipo de parceiro de distribuição, quando houver.
// A aderência por setor é PREMISSA COMERCIAL inicial, calibrável, e aparece como tal no score.

export type Setor =
  | "servicos_financeiros"
  | "imobiliario"
  | "servicos_profissionais"
  | "tecnologia"
  | "saude"
  | "industria"
  | "construcao"
  | "logistica"
  | "comercio"
  | "alimentacao"
  | "educacao"
  | "hotelaria"
  | "agro";

export const SETORES: Record<Setor, string> = {
  servicos_financeiros: "Serviços financeiros",
  imobiliario: "Imobiliário",
  servicos_profissionais: "Serviços profissionais",
  tecnologia: "Tecnologia",
  saude: "Saúde",
  industria: "Indústria",
  construcao: "Construção",
  logistica: "Transporte e logística",
  comercio: "Comércio",
  alimentacao: "Alimentação",
  educacao: "Educação",
  hotelaria: "Hotelaria e turismo",
  agro: "Agronegócio",
};

export type TipoParceiro =
  | "escritorio_investimento"
  | "consultoria_cvm"
  | "family_office"
  | "imobiliaria"
  | "auxiliar_financeiro"
  | "consultoria_empresarial"
  | "contabilidade"
  | "corretora_seguros";

// Aderência ao modelo white-label. ICP da Finture (escritório de investimento, family office,
// consultoria CVM, imobiliária) = 1. Os demais são perfis adjacentes, com nota menor.
export const TIPOS_PARCEIRO: Record<TipoParceiro, { label: string; aderencia: number; nota: string }> = {
  escritorio_investimento: { label: "Escritório de investimento", aderencia: 1, nota: "Perfil central do ICP" },
  consultoria_cvm: { label: "Gestora ou consultoria CVM", aderencia: 1, nota: "Perfil central do ICP; confirmar registro na CVM" },
  family_office: { label: "Holding (indício de family office)", aderencia: 0.6, nota: "CNAE de holding é só indício; confirmar se atua como family office" },
  imobiliaria: { label: "Imobiliária", aderencia: 1, nota: "Perfil central do ICP" },
  auxiliar_financeiro: { label: "Auxiliar de serviços financeiros", aderencia: 0.7, nota: "Perfil adjacente; qualificar a atividade real" },
  consultoria_empresarial: { label: "Consultoria empresarial", aderencia: 0.5, nota: "Perfil adjacente" },
  contabilidade: { label: "Contabilidade", aderencia: 0.3, nota: "Fora do ICP principal" },
  corretora_seguros: { label: "Corretora de seguros", aderencia: 0.3, nota: "Pode ser concorrente; avaliar caso a caso" },
};

export type CnaeInfo = {
  code: string;
  descricao: string;
  setor: Setor;
  parceria?: TipoParceiro;
};

export const CNAES: CnaeInfo[] = [
  { code: "6612-6/05", descricao: "Agentes de investimentos em aplicações financeiras", setor: "servicos_financeiros", parceria: "escritorio_investimento" },
  { code: "6630-4/00", descricao: "Atividades de administração de fundos por contrato ou comissão", setor: "servicos_financeiros", parceria: "consultoria_cvm" },
  { code: "6462-0/00", descricao: "Holdings de instituições não-financeiras", setor: "servicos_financeiros", parceria: "family_office" },
  { code: "6619-3/99", descricao: "Outras atividades auxiliares dos serviços financeiros não especificadas anteriormente", setor: "servicos_financeiros", parceria: "auxiliar_financeiro" },
  { code: "6622-3/00", descricao: "Corretores e agentes de seguros, de planos de previdência complementar e de saúde", setor: "servicos_financeiros", parceria: "corretora_seguros" },
  { code: "6821-8/01", descricao: "Corretagem na compra e venda e avaliação de imóveis", setor: "imobiliario", parceria: "imobiliaria" },
  { code: "6822-6/00", descricao: "Gestão e administração da propriedade imobiliária", setor: "imobiliario", parceria: "imobiliaria" },
  { code: "7020-4/00", descricao: "Atividades de consultoria em gestão empresarial, exceto consultoria técnica específica", setor: "servicos_profissionais", parceria: "consultoria_empresarial" },
  { code: "6920-6/01", descricao: "Atividades de contabilidade", setor: "servicos_profissionais", parceria: "contabilidade" },
  { code: "6911-7/01", descricao: "Serviços advocatícios", setor: "servicos_profissionais" },
  { code: "7112-0/00", descricao: "Serviços de engenharia", setor: "servicos_profissionais" },
  { code: "8211-3/00", descricao: "Serviços combinados de escritório e apoio administrativo", setor: "servicos_profissionais" },
  { code: "6201-5/01", descricao: "Desenvolvimento de programas de computador sob encomenda", setor: "tecnologia" },
  { code: "6202-3/00", descricao: "Desenvolvimento e licenciamento de programas de computador customizáveis", setor: "tecnologia" },
  { code: "8630-5/03", descricao: "Atividade médica ambulatorial restrita a consultas", setor: "saude" },
  { code: "8610-1/01", descricao: "Atividades de atendimento hospitalar, exceto pronto-socorro e unidades para atendimento a urgências", setor: "saude" },
  { code: "2222-6/00", descricao: "Fabricação de embalagens de material plástico", setor: "industria" },
  { code: "2539-0/01", descricao: "Serviços de usinagem, tornearia e solda", setor: "industria" },
  { code: "4120-4/00", descricao: "Construção de edifícios", setor: "construcao" },
  { code: "4930-2/02", descricao: "Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal, interestadual e internacional", setor: "logistica" },
  { code: "5211-7/99", descricao: "Depósitos de mercadorias para terceiros, exceto armazéns gerais e guarda-móveis", setor: "logistica" },
  { code: "4711-3/02", descricao: "Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados", setor: "comercio" },
  { code: "4639-7/01", descricao: "Comércio atacadista de produtos alimentícios em geral", setor: "comercio" },
  { code: "5611-2/01", descricao: "Restaurantes e similares", setor: "alimentacao" },
  { code: "8513-9/00", descricao: "Ensino fundamental", setor: "educacao" },
  { code: "5510-8/01", descricao: "Hotéis", setor: "hotelaria" },
  { code: "0115-6/00", descricao: "Cultivo de soja", setor: "agro" },
];

const BY_CODE = new Map(CNAES.map((c) => [c.code, c]));
export const cnaeInfo = (code: string | null | undefined): CnaeInfo | undefined =>
  code ? BY_CODE.get(code) : undefined;

export const CNAES_PARCEIRO = CNAES.filter((c) => c.parceria).map((c) => c.code);
export const CNAES_CLIENTE = CNAES.filter((c) => !c.parceria).map((c) => c.code);
export const cnaesDoSetor = (s: Setor) => CNAES.filter((c) => c.setor === s).map((c) => c.code);

// Aderência premissa por setor e solução (0 a 1). Hipótese comercial inicial; recalibrar com histórico.
export const ADERENCIA_SETOR: Record<Setor, { saude: number; seguro: number; credito: number }> = {
  tecnologia: { saude: 0.9, seguro: 0.5, credito: 0.6 },
  servicos_profissionais: { saude: 0.8, seguro: 0.4, credito: 0.5 },
  servicos_financeiros: { saude: 0.8, seguro: 0.4, credito: 0.4 },
  imobiliario: { saude: 0.6, seguro: 0.5, credito: 0.7 },
  saude: { saude: 0.7, seguro: 0.8, credito: 0.7 },
  industria: { saude: 0.8, seguro: 1, credito: 0.9 },
  construcao: { saude: 0.6, seguro: 1, credito: 0.9 },
  logistica: { saude: 0.7, seguro: 1, credito: 0.9 },
  comercio: { saude: 0.6, seguro: 0.8, credito: 0.8 },
  alimentacao: { saude: 0.5, seguro: 0.8, credito: 0.7 },
  educacao: { saude: 0.8, seguro: 0.7, credito: 0.6 },
  hotelaria: { saude: 0.6, seguro: 0.9, credito: 0.7 },
  agro: { saude: 0.5, seguro: 0.9, credito: 1 },
};
