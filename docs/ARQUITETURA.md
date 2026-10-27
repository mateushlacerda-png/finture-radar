# Arquitetura do Finture Radar

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript | Padrão dos outros projetos web do workspace (hub, marketing-bi, calendário); server components + server actions mantêm regra de negócio e acesso a banco no servidor |
| Estilo | Tailwind CSS 4 com tokens da Finture (`Uso de marca Finture/finture-design-system/tokens.css`) | Tokens canônicos já existem |
| Componentes | Componentes próprios em `src/components/ui` | shadcn/ui foi considerado; para o MVP preferi poucos componentes próprios com a marca aplicada direto, sem a camada de tema neutro do shadcn. Migrar para shadcn é compatível (mesmo Tailwind) |
| Mapa | MapLibre GL JS + estilo Positron do OpenFreeMap | Open source, sem chave de API, clusters em GPU com `cluster: true` |
| Gráficos | Recharts | Declarativo, leve, SSR-safe com `"use client"` |
| Banco | PostgreSQL via Drizzle ORM. **Dev/demo: PGlite** (Postgres em WASM, arquivo em `.data/`). **Produção: Postgres gerenciado** via `DATABASE_URL` | Mesmo dialeto e mesmas migrações nos dois ambientes; roda sem Docker nesta máquina (não há Docker nem psql instalados) |
| Geo | MVP: `lat`/`lng` com índice B-tree e filtro por bbox. Fase 2: PostGIS (`geography(Point)` + GIST) no Postgres gerenciado | PGlite não traz PostGIS de forma estável; o volume do MVP não precisa |
| Validação | Zod em toda server action e route handler | Entrada nunca confiada |
| Auth | Própria e mínima: scrypt + sessão opaca (token aleatório, hash SHA-256 no banco, cookie httpOnly/SameSite=Lax/Secure em produção) | Suficiente para demo multi-tenant. **ADR-003** descreve a troca por Better Auth (plugin organizations) ou Clerk antes de produção |
| Testes | Vitest (unidade: score, filtros) + Playwright (fluxos) | |

## Estrutura de pastas

```
Radar Finture/   (Desktop; cópia de trabalho desde 2026-10-27)
  docs/                      ANALISE-REFERENCIA, PRD, FONTES-DE-DADOS, ARQUITETURA, LGPD
  app/
    drizzle/                 migrações SQL geradas
    scripts/                 seed-demo.ts, import-receita.ts
    src/
      app/
        (auth)/login/        tela de login
        (app)/               área autenticada (layout com sidebar)
          page.tsx           dashboard
          radar/             mapa + filtros + lista + ficha
          listas/            listas e pesquisas salvas
          crm/               kanban + detalhe da oportunidade
          configuracoes/     calibração de score, usuários, auditoria
        api/
          companies/geo      GeoJSON para o mapa
          companies/export   CSV
          companies/[id]     ficha
      components/            ui/, radar/, crm/, dashboard/
      lib/
        db/                  schema.ts, client.ts
        auth/                session.ts, password.ts
        scoring/             engine.ts, criteria.ts, defaults.ts
        filters.ts           parse/serialize filtros (URL <-> objeto)
        domain.ts            etapas, soluções, portes, regiões
        queries/             leitura com org_id obrigatório
        actions/             server actions (mutação + auditoria)
      proxy.ts               bloqueio de rota sem sessão (Next 16)
    tests/                   unit/ e e2e/
```

## Modelo de dados

Dado **público** (compartilhado entre organizações) e dado **de trabalho** (sempre com `org_id`).

```
organizations(id, name, created_at)
users(id, org_id, email unique, name, role[admin|gestor|executivo], password_hash, created_at)
sessions(id, user_id, token_hash unique, expires_at)

companies(id, cnpj text(14) unique, razao_social, nome_fantasia, situacao, situacao_desde,
          cnae_principal, cnaes_secundarios text[], natureza_juridica, porte[ME|EPP|DEMAIS|NI],
          capital_social numeric, data_abertura date, uf, municipio, bairro, cep,
          lat, lng, geo_precision[endereco|cep|municipio],
          telefone, email, site, funcionarios_faixa (estimativa), funcionarios_fonte,
          source[receita|enriquecimento|demo], source_ref, is_demo bool, updated_at)

company_status(org_id, company_id, status[novo|prospectado|descartado], discard_reason, updated_by, updated_at)  PK(org_id, company_id)
suppressions(id, org_id, cnpj, kind[oposicao|remocao], requested_by_text, note, created_by, created_at)

lists(id, org_id, name, created_by, created_at)
list_items(list_id, company_id, added_by, added_at)  PK(list_id, company_id)
saved_searches(id, org_id, name, filters jsonb, created_by, created_at)

opportunities(id, org_id, company_id, funnel[parceiro|cliente], solution, stage, owner_id,
              next_action, next_action_at, lost_reason, created_at, updated_at, closed_at, is_demo)
activities(id, org_id, opportunity_id, company_id, user_id, type[nota|ligacao|email|whatsapp|reuniao|etapa|tarefa], body, meta jsonb, created_at)
tasks(id, org_id, opportunity_id, title, due_at, done, assignee_id, created_at)

score_configs(id, org_id, version, weights jsonb, created_by, created_at)   -- vigente = maior version
audit_events(id, org_id, user_id, action, entity, entity_id, data jsonb, created_at)
ingestion_runs(id, source, competencia, read, inserted, updated, rejected, started_at, finished_at)
```

Índices: `companies(uf, municipio)`, `companies(cnae_principal)`, `companies(lat, lng)`, `opportunities(org_id, stage)`, `activities(opportunity_id, created_at)`.

## Motor de score (`src/lib/scoring`)

Função pura `scoreCompany(company, cnaeInfo, weights, now)` → `{ geral, saude, seguro, credito, parceria }`, cada um com:

```ts
{ value: 0..100, confidence: 'alta'|'media'|'baixa',
  criteria: [{ key, label, weight, points: 0..1, evidence, origin: 'receita'|'enriquecimento'|'estimativa'|'demo'|'ausente', isEstimate }] }
```

- `value = round(100 · Σ(peso · pontos) / Σ(peso))`.
- Critério sem dado: `points = 0`, `origin = 'ausente'`; reduz a confiança (alta ≥ 80% do peso com dado, média ≥ 50%).
- Geral = pesos sobre (melhor score de solução, qualidade do dado, porte).
- Pesos por organização em `score_configs`, versionados; defaults em `defaults.ts`.
- Execução: no MVP o servidor calcula em memória sobre o recorte filtrado em SQL, com cache por (pesos, dia), porque a empresa só muda na ingestão. Fase 2: tabela `company_scores(org_id, company_id, config_version, ...)` recalculada em lote quando os pesos mudam ou entra lote novo.
- Fase 4: substituir pontos por probabilidade de modelo treinado em `opportunities` ganhas/perdidas, mantendo a decomposição (SHAP ou equivalente) para não perder a explicação.

## APIs

Leitura pesada por route handler (cacheável, consumida pelo mapa); mutação por server action.

| Rota | Método | Descrição |
|---|---|---|
| `/api/companies/geo?<filtros>` | GET | GeoJSON (id, score geral, status) para o mapa |
| `/api/companies?<filtros>&page=` | GET | Lista ranqueada paginada |
| `/api/companies/[id]` | GET | Ficha completa com scores, status, oportunidades, listas |
| `/api/companies/export?<filtros>` ou `?list=` | GET | CSV |
| Server actions | POST | login/logout, listas, pesquisas, status/descarte, oposição, oportunidades, atividades, tarefas, pesos |

Toda rota chama `requireSession()` e passa `session.orgId` para as queries. Nenhuma query de dado de trabalho aceita `org_id` vindo do cliente.

## Desvios do plano, registrados na implementação

- **Catálogo de CNAEs em código** (`src/lib/cnaes.ts`), não em tabela: é pequeno, versionado junto do motor de score e traz a premissa de aderência por setor. Vira tabela quando a ingestão cobrir todos os CNAEs.
- **Cache de score em memória** (por pesos + dia) em vez de `company_scores`; a tabela está em `docs/sql/postgis-producao.sql`.
- **Gráficos**: Recharts só para linha e barras por UF; funil, pipeline e aderência são barras em HTML, mais leves e acessíveis.
- **Paleta de dados**: laranja `#ea622d` + azul `#1f78a8`, validada pelo script da skill dataviz (CVD e contraste). A interface é só modo claro.

## Visão geral e briefing por IA (2026-10-23)

- **Factual** (`src/lib/overview.ts`): texto montado só com o cadastro e a descrição que a empresa publica no próprio site. Sem inferência; é testado.
- **Coleta do site** (`scripts/coletar-sites.ts` + `src/lib/site-extract.ts`): título, descrição, LinkedIn e Instagram de empresa, lidos da página inicial do site confirmado. Perfil pessoal (`linkedin.com/in/`) é ignorado. Nada é buscado no próprio LinkedIn.
- **Briefing por IA** (`src/lib/ai/overview.ts`), sob demanda pelo botão na ficha:
  - roda `claude -p` local (Claude Code), escolha do usuário porque não há chave de API;
  - a entrada é o cadastro mais o texto da home e da página institucional; a saída é um JSON validado por Zod, gravado em `company_overviews` por organização.
- **Segurança do briefing**:
  - o texto do site é dado não confiável e pode trazer prompt injection, por isso o CLI roda com `--tools ""`, `--restricted`, `--strict-mcp-config`, sem sessão e em pasta temporária vazia;
  - no máximo 2 gerações simultâneas;
  - pós-filtro remove travessão e descarta respostas que citem comissão ou repasse.
- **Produção:** trocar `runClaude` por chamada à API da Anthropic, mantendo prompt e schema.

## Integrações (preparadas, não implementadas)

`src/lib/integrations/` define interfaces, sem implementação ativa:

- `CrmSink`: `pushOpportunity(op)`, `pushActivity(a)`. Alvo inicial: CRM da plataforma Finture (hub-partner), via API autenticada por token de serviço guardado em variável de ambiente do servidor. Fila com retry (Vercel Queues ou tabela outbox) para não perder evento.
- `MessagingChannel`: WhatsApp Business Cloud API. Envio só de template aprovado, opt-in registrado, webhook de status assinado (verificação de `X-Hub-Signature-256`).
- `Enricher`: provedor de enriquecimento por CNPJ, gravando origem e data por campo.

Padrão: **outbox** (`integration_outbox`) gravada na mesma transação da mudança de negócio, consumida por worker. Segredos só em env do servidor.

## ADRs

- **ADR-001 PGlite no dev/demo, Postgres gerenciado em produção.** Mesmo dialeto; troca por `DATABASE_URL`. Risco: PGlite é processo único; não serve para produção nem para múltiplas instâncias.
- **ADR-002 Score calculado em código, não em SQL.** Explicabilidade e testes unitários valem mais que desempenho no volume do MVP. Persistência em `company_scores` na fase 2.
- **ADR-003 Auth própria só no MVP.** Antes de produção, migrar para Better Auth (organizations, convites, 2FA) ou Clerk. A tabela `users` mantém `org_id` e `role`, e a interface `requireSession()` não muda.
- **ADR-004 Dados públicos globais, trabalho por organização.** `companies` é compartilhada; tudo que a organização produz tem `org_id`.
- **ADR-005 CNPJ como texto.** Prepara o CNPJ alfanumérico (IN RFB 2.229/2024, vigente para novas inscrições em 2026).
- **ADR-006 Sem valor monetário estimado por lead.** Sem fonte de faturamento, o Radar não mostra "R$ por mês". Valor de oportunidade, quando existir, é digitado pelo comercial.

## Deploy (produção, fase 2)

1. Postgres gerenciado com PostGIS (Neon ou Supabase), `DATABASE_URL` em env.
2. `npm run db:migrate` no pipeline antes do deploy.
3. `AUTH_SECRET` não é usado para assinar sessão (token opaco), mas `SESSION_COOKIE_SECURE=true` é forçado em produção.
4. Vercel (padrão do workspace). Monitoramento: Vercel Observability + logs estruturados das actions; erros com `error.tsx` por segmento.
5. Ingestão mensal como job agendado (Vercel Cron ou worker externo; o volume da Receita não cabe em função serverless, então usar máquina/worker dedicado).
