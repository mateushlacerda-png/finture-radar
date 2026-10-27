/**
 * Seed do AMBIENTE DE DEMONSTRAÇÃO. Tudo aqui é simulado:
 *  - razão social termina em "DEMO LTDA";
 *  - CNPJ com dígitos verificadores propositalmente INVÁLIDOS (não colide com CNPJ real);
 *  - e-mail e site no domínio reservado .example; telefone com prefixo 0 (inexistente);
 *  - coordenadas = centro real do município + dispersão aleatória (geo_precision "municipio"/"cep" simulada);
 *  - is_demo = true em empresas e oportunidades.
 *
 * Uso: npm run db:seed   (apaga .data/pglite e recria)
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import { CNAES, cnaeInfo } from "../src/lib/cnaes";
import { ETAPA_KEYS, ETAPAS_ABERTAS, MOTIVOS_DESCARTE, type Etapa, type Solucao } from "../src/lib/domain";
import { DEFAULT_WEIGHTS, type Weights } from "../src/lib/scoring/weights";
import { scoreCompany } from "../src/lib/scoring/engine";
import { hashPassword } from "../src/lib/auth/password";

const ROOT = path.resolve(__dirname, "..");
const DIR = path.resolve(ROOT, process.env.RADAR_DB_DIR ?? path.join(".data", "pglite"));
const N = process.argv.includes("--base") ? 0 : Number(process.env.SEED_COMPANIES ?? 4800);
export const DEMO_PASSWORD = "radar-demo-2026";

// PRNG determinístico (mulberry32) para o seed ser reprodutível.
let s = 20261023;
const rnd = () => {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}

// Centros reais dos municípios (coordenadas públicas aproximadas). Peso = só para distribuir a demo.
const CIDADES: [string, string, number, number, number][] = [
  ["SP", "São Paulo", -23.5505, -46.6333, 22], ["SP", "Campinas", -22.9056, -47.0608, 4], ["SP", "Santos", -23.9608, -46.3336, 2],
  ["SP", "Ribeirão Preto", -21.1775, -47.8103, 2.5], ["SP", "São José dos Campos", -23.1791, -45.8872, 2], ["SP", "Sorocaba", -23.5015, -47.4526, 2],
  ["SP", "Presidente Prudente", -22.1256, -51.3889, 1],
  ["RJ", "Rio de Janeiro", -22.9068, -43.1729, 12], ["RJ", "Niterói", -22.8832, -43.1034, 2.5], ["RJ", "Petrópolis", -22.505, -43.1786, 1.2],
  ["RJ", "Campos dos Goytacazes", -21.7545, -41.3244, 1], ["RJ", "Volta Redonda", -22.5231, -44.1042, 0.8],
  ["MG", "Belo Horizonte", -19.9167, -43.9345, 7], ["MG", "Uberlândia", -18.9186, -48.2772, 2], ["MG", "Juiz de Fora", -21.7642, -43.3496, 1.5], ["MG", "Contagem", -19.9321, -44.0539, 1.2],
  ["ES", "Vitória", -20.3155, -40.3128, 1.8], ["ES", "Vila Velha", -20.3297, -40.2925, 1],
  ["PR", "Curitiba", -25.4284, -49.2733, 5], ["PR", "Londrina", -23.3045, -51.1696, 1.5], ["PR", "Maringá", -23.4205, -51.9333, 1.3],
  ["SC", "Florianópolis", -27.5954, -48.548, 2], ["SC", "Joinville", -26.3045, -48.8487, 1.6], ["SC", "Blumenau", -26.9194, -49.0661, 1.2],
  ["RS", "Porto Alegre", -30.0346, -51.2177, 5], ["RS", "Caxias do Sul", -29.1678, -51.1794, 1.5], ["RS", "Pelotas", -31.7654, -52.3376, 0.8],
  ["DF", "Brasília", -15.7939, -47.8828, 5], ["GO", "Goiânia", -16.6869, -49.2648, 3], ["GO", "Anápolis", -16.3281, -48.953, 0.7],
  ["MT", "Cuiabá", -15.6014, -56.0979, 1.5], ["MT", "Rondonópolis", -16.4673, -54.6372, 0.7], ["MS", "Campo Grande", -20.4697, -54.6201, 1.5],
  ["BA", "Salvador", -12.9714, -38.5014, 4], ["BA", "Feira de Santana", -12.2664, -38.9663, 1], ["PE", "Recife", -8.0476, -34.877, 3.5],
  ["PE", "Caruaru", -8.276, -35.9819, 0.6], ["CE", "Fortaleza", -3.7319, -38.5267, 3.5], ["RN", "Natal", -5.7945, -35.211, 1.3],
  ["PB", "João Pessoa", -7.1195, -34.845, 1.2], ["AL", "Maceió", -9.6658, -35.7353, 1], ["SE", "Aracaju", -10.9472, -37.0731, 0.9],
  ["PI", "Teresina", -5.0892, -42.8019, 0.9], ["MA", "São Luís", -2.5307, -44.3068, 1], ["PA", "Belém", -1.4558, -48.4902, 1.5],
  ["AM", "Manaus", -3.119, -60.0217, 1.8], ["TO", "Palmas", -10.184, -48.3336, 0.5], ["RO", "Porto Velho", -8.7612, -63.9004, 0.5],
  ["AC", "Rio Branco", -9.9747, -67.81, 0.3], ["AP", "Macapá", 0.0349, -51.0694, 0.3], ["RR", "Boa Vista", 2.8235, -60.6758, 0.3],
];

const RAIZ = ["Atlas", "Aurora", "Vértice", "Horizonte", "Âncora", "Prisma", "Nobre", "Alvorada", "Cedro", "Meridiano", "Orla", "Serra", "Vale", "Lumen", "Solar",
  "Bússola", "Farol", "Ipê", "Jatobá", "Granito", "Marco", "Pilar", "Rota", "Sigma", "Tríade", "Vista", "Zênite", "Opala", "Quartzo", "Delta"];
const SUFIXO: Record<string, string[]> = {
  servicos_financeiros: ["Investimentos", "Gestão Patrimonial", "Capital", "Participações", "Finanças"],
  imobiliario: ["Imóveis", "Negócios Imobiliários", "Consultoria Imobiliária"],
  servicos_profissionais: ["Consultoria", "Contabilidade", "Advogados Associados", "Engenharia", "Serviços Administrativos"],
  tecnologia: ["Tecnologia", "Sistemas", "Software"],
  saude: ["Clínica Médica", "Saúde", "Centro Médico"],
  industria: ["Indústria", "Plásticos", "Usinagem"],
  construcao: ["Construtora", "Edificações", "Obras"],
  logistica: ["Transportes", "Logística", "Armazéns"],
  comercio: ["Supermercados", "Distribuidora", "Comércio"],
  alimentacao: ["Restaurante", "Gastronomia", "Bistrô"],
  educacao: ["Colégio", "Escola", "Educação"],
  hotelaria: ["Hotel", "Hotelaria", "Pousada"],
  agro: ["Agropecuária", "Agrícola", "Grãos"],
};
const BAIRROS = ["Centro", "Jardim América", "Vila Nova", "Boa Vista", "Santa Cruz", "Industrial", "São José", "Bela Vista"];

function cnpjFicticio(used: Set<string>): string {
  for (;;) {
    const base = Array.from({ length: 12 }, () => Math.floor(rnd() * 10));
    const dv = (nums: number[]) => {
      const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const r = nums.reduce((a, n, i) => a + n * pesos[i], 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = dv(base);
    const d2 = dv([...base, d1]);
    // Desloca os dois dígitos verificadores: o CNPJ fica sintaticamente parecido, mas inválido.
    const cnpj = [...base, (d1 + 3) % 10, (d2 + 7) % 10].join("");
    if (!used.has(cnpj)) {
      used.add(cnpj);
      return cnpj;
    }
  }
}
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const NOW = new Date();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const client = new PGlite(DIR);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(ROOT, "drizzle") });

  // ---------- organização, usuários, pesos ----------
  const [org] = await db.insert(schema.organizations).values({ name: "Finture (demonstração)" }).returning();
  const pwd = await hashPassword(DEMO_PASSWORD);
  const usuarios = await db
    .insert(schema.users)
    .values([
      { orgId: org.id, email: "admin@finture.demo", name: "Marina Couto", role: "admin", passwordHash: pwd },
      { orgId: org.id, email: "gestor@finture.demo", name: "Rafael Lima", role: "gestor", passwordHash: pwd },
      { orgId: org.id, email: "juliana@finture.demo", name: "Juliana Prado", role: "executivo", passwordHash: pwd },
      { orgId: org.id, email: "bruno@finture.demo", name: "Bruno Teles", role: "executivo", passwordHash: pwd },
    ])
    .returning();
  // Segunda organização só para provar o isolamento multi-tenant nos testes.
  const [org2] = await db.insert(schema.organizations).values({ name: "Organização B (teste de isolamento)" }).returning();
  await db.insert(schema.users).values({ orgId: org2.id, email: "outra@org-b.demo", name: "Usuário Org B", role: "admin", passwordHash: pwd });

  await db.insert(schema.scoreConfigs).values({ orgId: org.id, version: 1, weights: DEFAULT_WEIGHTS, createdBy: usuarios[0].id });
  await db.insert(schema.scoreConfigs).values({ orgId: org2.id, version: 1, weights: DEFAULT_WEIGHTS });

  // --base: só organização, usuários e pesos, para receber a ingestão real da Receita.
  if (N === 0) {
    console.log("Seed base OK: organizações, usuários e pesos, sem empresas. Rode scripts/import-receita.ts.");
    await client.close();
    return;
  }

  // ---------- empresas ----------
  const used = new Set<string>();
  const cnaePesos: [string, number][] = CNAES.map((c) => {
    const p = c.parceria;
    const w = p === "escritorio_investimento" || p === "imobiliaria" ? 7 : p === "consultoria_cvm" ? 4 : p === "family_office" ? 3 : p ? 3.5 : 4;
    return [c.code, w];
  });
  const cidadePesos: [(typeof CIDADES)[number], number][] = CIDADES.map((c) => [c, c[4]]);

  const rows: (typeof schema.companies.$inferInsert)[] = [];
  for (let i = 0; i < N; i++) {
    const [uf, municipio, lat, lng] = weighted(cidadePesos);
    const cnae = weighted(cnaePesos);
    const info = cnaeInfo(cnae)!;
    const porte = weighted<string>([["ME", 55], ["EPP", 28], ["DEMAIS", 15], ["NI", 2]]);
    const func = chance(0.15)
      ? null
      : porte === "ME" ? weighted<string>([["1-4", 60], ["5-9", 35], ["10-49", 5]])
      : porte === "EPP" ? weighted<string>([["5-9", 25], ["10-49", 65], ["50-99", 10]])
      : porte === "DEMAIS" ? weighted<string>([["10-49", 25], ["50-99", 35], ["100+", 40]])
      : null;
    const capitalBase = porte === "ME" ? 30_000 : porte === "EPP" ? 300_000 : porte === "DEMAIS" ? 3_000_000 : 50_000;
    const capital = chance(0.1) ? null : Math.round((capitalBase * (0.2 + rnd() * 3)) / 1000) * 1000;
    const anos = weighted<number>([[0.5, 8], [2, 15], [6, 30], [15, 30], [28, 17]]) * (0.6 + rnd() * 0.8);
    const abertura = daysAgo(Math.round(anos * 365));
    const situacao = weighted<string>([["ATIVA", 94], ["INAPTA", 3], ["SUSPENSA", 1], ["BAIXADA", 2]]);
    const raiz = pick(RAIZ);
    const fantasia = `${raiz} ${pick(SUFIXO[info.setor])}`;
    const sl = slug(fantasia) + i;
    const ddd = String(11 + Math.floor(rnd() * 80)).padStart(2, "0");
    const isPartner = !!info.parceria;
    const precisa = chance(0.5);
    const spread = precisa ? 0.035 : 0.06;
    rows.push({
      cnpj: cnpjFicticio(used),
      razaoSocial: `${fantasia.toUpperCase()} ${raiz.length % 2 ? "SERVICOS" : "EMPREENDIMENTOS"} DEMO LTDA`,
      nomeFantasia: chance(0.88) ? fantasia : null,
      situacao,
      situacaoDesde: situacao === "ATIVA" ? isoDate(abertura) : isoDate(daysAgo(Math.round(rnd() * 900))),
      cnaePrincipal: cnae,
      cnaesSecundarios: chance(0.4) ? [pick(CNAES).code] : [],
      naturezaJuridica: "206-2 Sociedade Empresária Limitada",
      porte,
      capitalSocial: capital,
      dataAbertura: isoDate(abertura),
      uf,
      municipio,
      bairro: pick(BAIRROS),
      cep: null,
      lat: lat + (rnd() - 0.5) * 2 * spread,
      lng: lng + (rnd() - 0.5) * 2 * spread,
      geoPrecision: precisa ? "cep" : "municipio",
      telefone: chance(0.8) ? `(${ddd}) 0${Math.floor(100 + rnd() * 899)}-${Math.floor(1000 + rnd() * 8999)}` : null,
      email: chance(isPartner ? 0.7 : 0.55) ? `contato@${sl}.example` : null,
      site: chance(isPartner ? 0.55 : 0.35) ? `https://www.${sl}.example` : null,
      funcionariosFaixa: func,
      funcionariosFonte: func ? "Estimativa simulada (demo)" : null,
      source: "demo",
      sourceRef: "seed-demo",
      isDemo: true,
    });
  }
  const inserted: { id: number }[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    inserted.push(...(await db.insert(schema.companies).values(rows.slice(i, i + 500)).returning({ id: schema.companies.id })));
  }

  // ---------- oportunidades e histórico ----------
  const weights = DEFAULT_WEIGHTS as unknown as Weights;
  const scored = rows
    .map((r, idx) => ({ id: inserted[idx].id, r, s: scoreCompany(r as never, weights, NOW) }))
    .filter((x) => x.r.situacao === "ATIVA");
  const parceiros = scored.filter((x) => cnaeInfo(x.r.cnaePrincipal)?.parceria).sort((a, b) => b.s.parceria.value - a.s.parceria.value);
  const clientes = scored.filter((x) => !cnaeInfo(x.r.cnaePrincipal)?.parceria).sort((a, b) => b.s.geral.value - a.s.geral.value);
  const execs = usuarios.filter((u) => u.role !== "admin");
  const usedCompanies = new Set<number>();

  const stageMix: [Etapa, number][] = [
    ["lead_identificado", 22], ["lead_qualificado", 16], ["primeiro_contato", 14], ["reuniao_agendada", 10], ["diagnostico", 8],
    ["proposta_enviada", 7], ["negociacao", 5], ["ganho", 8], ["perdido", 10],
  ];

  async function criarOpp(c: (typeof scored)[number], funnel: "parceiro" | "cliente") {
    usedCompanies.add(c.id);
    const solution: Solucao = funnel === "parceiro" ? "parceria" : (["saude", "seguro", "credito"] as Solucao[]).sort((a, b) => c.s[b].value - c.s[a].value)[0];
    const stage = weighted(stageMix);
    const idx = ETAPA_KEYS.indexOf(stage);
    const maxIdx = stage === "perdido" ? Math.floor(rnd() * 6) : stage === "ganho" ? idx : idx;
    const created = daysAgo(5 + Math.floor(rnd() * 175));
    const owner = pick(execs);
    const span = (NOW.getTime() - created.getTime()) * (0.5 + rnd() * 0.45);
    const closed = stage === "ganho" || stage === "perdido" ? new Date(created.getTime() + span) : null;
    const [op] = await db
      .insert(schema.opportunities)
      .values({
        orgId: org.id,
        companyId: c.id,
        funnel,
        solution,
        stage,
        maxStageIndex: maxIdx,
        ownerId: owner.id,
        nextAction: ETAPAS_ABERTAS.includes(stage) ? pick(["Ligar para apresentar o modelo", "Enviar material de apresentação", "Confirmar reunião", "Levantar dados para diagnóstico", "Retomar negociação"]) : null,
        nextActionAt: ETAPAS_ABERTAS.includes(stage) ? new Date(NOW.getTime() + (rnd() * 20 - 5) * 86400000) : null,
        lostReason: stage === "perdido" ? pick(["Sem interesse no momento", "Já tem fornecedor", "Sem retorno", "Fora do perfil"]) : null,
        isDemo: true,
        createdAt: created,
        updatedAt: closed ?? daysAgo(Math.floor(rnd() * 5)),
        closedAt: closed,
      })
      .returning();

    const acts: (typeof schema.activities.$inferInsert)[] = [];
    const lastStageIdx = stage === "perdido" ? maxIdx : idx;
    const end = closed ?? NOW;
    for (let k = 0; k <= lastStageIdx; k++) {
      const at = new Date(created.getTime() + ((end.getTime() - created.getTime()) * k) / (lastStageIdx + 1));
      acts.push({ orgId: org.id, opportunityId: op.id, companyId: c.id, userId: owner.id, type: "etapa", body: `Etapa: ${ETAPA_KEYS[k]}`, createdAt: at });
      if (k >= 2 && chance(0.6)) {
        acts.push({ orgId: org.id, opportunityId: op.id, companyId: c.id, userId: owner.id, type: pick(["ligacao", "email", "whatsapp", "reuniao"]), body: pick(["Conversa inicial, pediu material", "Apresentado o modelo white-label", "Alinhado próximo passo", "Sem resposta, tentar de novo"]), createdAt: new Date(at.getTime() + 3600000) });
      }
    }
    if (stage === "perdido") acts.push({ orgId: org.id, opportunityId: op.id, companyId: c.id, userId: owner.id, type: "etapa", body: "Etapa: perdido", createdAt: end });
    if (stage === "ganho") acts.push({ orgId: org.id, opportunityId: op.id, companyId: c.id, userId: owner.id, type: "etapa", body: "Etapa: ganho", createdAt: end });
    await db.insert(schema.activities).values(acts);
    if (ETAPAS_ABERTAS.includes(stage) && chance(0.7)) {
      await db.insert(schema.tasks).values({ orgId: org.id, opportunityId: op.id, title: op.nextAction ?? "Retomar contato", dueAt: op.nextActionAt, assigneeId: owner.id });
    }
    await db.insert(schema.companyStatus).values({ orgId: org.id, companyId: c.id, status: "prospectado", updatedBy: owner.id }).onConflictDoNothing();
  }

  for (const c of parceiros.slice(0, 600).filter(() => chance(0.22)).slice(0, 120)) await criarOpp(c, "parceiro");
  for (const c of clientes.slice(0, 800).filter(() => chance(0.13)).slice(0, 90)) await criarOpp(c, "cliente");

  // descartes
  const descartes = scored.filter((x) => !usedCompanies.has(x.id) && chance(0.012)).slice(0, 45);
  for (const d of descartes) {
    await db.insert(schema.companyStatus).values({ orgId: org.id, companyId: d.id, status: "descartado", discardReason: pick(MOTIVOS_DESCARTE), updatedBy: pick(execs).id });
  }

  // listas e pesquisas
  const [l1] = await db.insert(schema.lists).values({ orgId: org.id, name: "Parceiros prioritários RJ", createdBy: usuarios[1].id }).returning();
  const [l2] = await db.insert(schema.lists).values({ orgId: org.id, name: "Imobiliárias SP", createdBy: usuarios[2].id }).returning();
  const rj = parceiros.filter((p) => p.r.uf === "RJ").slice(0, 18);
  const imobSp = parceiros.filter((p) => p.r.uf === "SP" && cnaeInfo(p.r.cnaePrincipal)?.parceria === "imobiliaria").slice(0, 25);
  if (rj.length) await db.insert(schema.listItems).values(rj.map((p) => ({ listId: l1.id, companyId: p.id, addedBy: usuarios[1].id })));
  if (imobSp.length) await db.insert(schema.listItems).values(imobSp.map((p) => ({ listId: l2.id, companyId: p.id, addedBy: usuarios[2].id })));
  await db.insert(schema.savedSearches).values([
    { orgId: org.id, name: "Escritórios e gestoras no Sudeste, score 70+", query: "regiao=sudeste&tipo=parceiro&scoreMin=70", createdBy: usuarios[1].id },
    { orgId: org.id, name: "Saúde coletiva: EPP e médias em SP", query: "uf=SP&porte=EPP,DEMAIS&solucao=saude&scoreMin=60", createdBy: usuarios[2].id },
  ]);

  await db.insert(schema.ingestionRuns).values({ source: "demo", competencia: isoDate(NOW).slice(0, 7), read: N, inserted: N, finishedAt: new Date() });

  const nOpps = (await client.query<{ n: number }>("select count(*)::int n from opportunities")).rows[0].n;
  console.log(`Seed OK: ${N} empresas simuladas, ${nOpps} oportunidades, ${descartes.length} descartes.`);
  console.log(`Logins (senha ${DEMO_PASSWORD}): admin@finture.demo, gestor@finture.demo, juliana@finture.demo, bruno@finture.demo`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
