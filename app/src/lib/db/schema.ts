import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- organização e acesso ----------

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "gestor", "executivo"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------- dado público (compartilhado entre organizações) ----------

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    cnpj: text("cnpj").notNull(), // 14 caracteres; alfanumérico a partir de 2026
    razaoSocial: text("razao_social").notNull(),
    nomeFantasia: text("nome_fantasia"),
    situacao: text("situacao").notNull(),
    situacaoDesde: date("situacao_desde"),
    cnaePrincipal: text("cnae_principal"),
    cnaesSecundarios: text("cnaes_secundarios").array().notNull().default(sql`'{}'::text[]`),
    naturezaJuridica: text("natureza_juridica"),
    porte: text("porte"),
    capitalSocial: numeric("capital_social", { mode: "number" }),
    dataAbertura: date("data_abertura"),
    uf: text("uf").notNull(),
    municipio: text("municipio").notNull(),
    bairro: text("bairro"),
    cep: text("cep"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geoPrecision: text("geo_precision"),
    telefone: text("telefone"),
    email: text("email"),
    site: text("site"),
    siteFonte: text("site_fonte"), // de onde veio o site e quando foi verificado
    // Coletados da página inicial do próprio site da empresa (scripts/coletar-sites.ts).
    siteTitulo: text("site_titulo"),
    siteDescricao: text("site_descricao"),
    linkedin: text("linkedin"),
    instagram: text("instagram"),
    siteColetadoEm: timestamp("site_coletado_em", { withTimezone: true }),
    funcionariosFaixa: text("funcionarios_faixa"),
    funcionariosFonte: text("funcionarios_fonte"),
    source: text("source", { enum: ["receita", "enriquecimento", "demo"] }).notNull(),
    sourceRef: text("source_ref"),
    // Competência (AAAA-MM) em que a empresa entrou na base pela atualização mensal; nulo = carga inicial.
    entrouEm: text("entrou_em"),
    isDemo: boolean("is_demo").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_cnpj_uq").on(t.cnpj),
    index("companies_uf_mun_idx").on(t.uf, t.municipio),
    index("companies_cnae_idx").on(t.cnaePrincipal),
    index("companies_geo_idx").on(t.lat, t.lng),
    index("companies_entrou_em_idx").on(t.entrouEm),
  ],
);

// ---------- dado de trabalho (sempre com org_id) ----------

export const companyStatus = pgTable(
  "company_status",
  {
    orgId: text("org_id").notNull().references(() => organizations.id),
    companyId: integer("company_id").notNull().references(() => companies.id),
    status: text("status", { enum: ["novo", "prospectado", "descartado"] }).notNull(),
    discardReason: text("discard_reason"),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.companyId] })],
);

export const suppressions = pgTable(
  "suppressions",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id),
    cnpj: text("cnpj").notNull(),
    kind: text("kind", { enum: ["oposicao", "remocao"] }).notNull(),
    requester: text("requester"),
    note: text("note"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppressions_org_cnpj_uq").on(t.orgId, t.cnpj)],
);

export const lists = pgTable("lists", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const listItems = pgTable(
  "list_items",
  {
    listId: text("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull().references(() => companies.id),
    addedBy: text("added_by").references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.companyId] })],
);

export const savedSearches = pgTable("saved_searches", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  query: text("query").notNull(), // querystring serializada dos filtros
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id),
    companyId: integer("company_id").notNull().references(() => companies.id),
    funnel: text("funnel", { enum: ["parceiro", "cliente"] }).notNull(),
    solution: text("solution").notNull(),
    stage: text("stage").notNull(),
    maxStageIndex: integer("max_stage_index").notNull().default(0),
    ownerId: text("owner_id").references(() => users.id),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("opps_org_stage_idx").on(t.orgId, t.funnel, t.stage), index("opps_company_idx").on(t.companyId)],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id),
    opportunityId: text("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull().references(() => companies.id),
    userId: text("user_id").references(() => users.id),
    type: text("type").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activities_opp_idx").on(t.opportunityId, t.createdAt), index("activities_company_idx").on(t.orgId, t.companyId)],
);

export const tasks = pgTable("tasks", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id),
  opportunityId: text("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  done: boolean("done").notNull().default(false),
  assigneeId: text("assignee_id").references(() => users.id),
  createdAt: createdAt(),
});

export const scoreConfigs = pgTable(
  "score_configs",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id),
    version: integer("version").notNull(),
    weights: jsonb("weights").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("score_configs_org_version_uq").on(t.orgId, t.version)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_created_idx").on(t.orgId, t.createdAt)],
);

// Overview gerado por IA sob demanda, por organização (quem pesquisou o quê não vaza entre organizações).
export const companyOverviews = pgTable(
  "company_overviews",
  {
    orgId: text("org_id").notNull().references(() => organizations.id),
    companyId: integer("company_id").notNull().references(() => companies.id),
    conteudo: jsonb("conteudo").notNull(),
    fontes: jsonb("fontes").notNull(),
    modelo: text("modelo").notNull(),
    geradoPor: text("gerado_por").references(() => users.id),
    geradoEm: timestamp("gerado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.companyId] })],
);

export const ingestionRuns = pgTable("ingestion_runs", {
  id: id(),
  source: text("source").notNull(),
  competencia: text("competencia"),
  read: integer("read").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type Company = typeof companies.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type User = typeof users.$inferSelect;
