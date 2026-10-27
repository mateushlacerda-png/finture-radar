# Finture Radar

Inteligência comercial B2B da Finture: empresas priorizadas por aderência às soluções (saúde coletiva, seguro empresarial, crédito e parceria white-label), score explicável, listas e CRM com funis separados para parceiros e clientes finais.

**Estado:** MVP funcional com **dados reais** da Receita Federal (competência 2026-10, recorte "ICP enxuto", 86.054 empresas ativas). A base simulada continua separada para os testes. Ver `docs/VALIDACAO.md`.

## Documentos

| Arquivo | Conteúdo |
|---|---|
| `docs/ANALISE-REFERENCIA.md` | Etapa 1: o que foi verificado no radar.rctech.cc e o que não foi (área logada fechada) |
| `docs/PRD-FINTURE-RADAR.md` | Etapa 2: objetivo, perfis, jornadas, funcionalidades, critérios de aceite, MVP × futuro |
| `docs/ARQUITETURA.md` | Etapa 3: stack, pastas, modelo de dados, motor de score, APIs, integrações, ADRs, deploy |
| `docs/FONTES-DE-DADOS.md` | Origem, frequência, cobertura, licença e custo das fontes; plano de ingestão |
| `docs/LGPD.md` | Base legal proposta, direitos do titular, auditoria, segurança (rascunho para o jurídico) |
| `docs/VALIDACAO.md` | Etapa 5: testes, critérios de aceite, o que depende de integração |
| `docs/sql/postgis-producao.sql` | PostGIS, scores persistidos e RLS para a fase 2 |
| `docs/screens/` | Capturas das telas |

## Bases

| Base | Pasta | Conteúdo | Como criar |
|---|---|---|---|
| Real | `app/.data/pglite` | Empresas da Receita (recorte ICP enxuto) + usuários de demonstração | ver "Dados reais" abaixo |
| Demonstração | `app/.data/pglite-demo` | 4.800 empresas SIMULADAS + oportunidades fictícias | `npm run db:seed:demo` |

`npm run dev`/`start` usam a base real (porta 3210); `npm run dev:demo` usa a simulada (porta 3211). Os e2e usam sempre a simulada.

## Rodar localmente

```bash
cd app
npm install
npm run build && npm run start   # http://localhost:3210, base real
```

Usuários de demonstração (senha `radar-demo-2026`): `admin@finture.demo` (calibra o score), `gestor@finture.demo`, `juliana@finture.demo` e `bruno@finture.demo` (executivos), `outra@org-b.demo` (outra organização, para testar isolamento).

**Pare o servidor antes de rodar o seed.** O PGlite é processo único.

## Testes

```bash
npm test             # unidade (vitest)
npm run test:e2e     # fluxos (Playwright), sempre na base SIMULADA, servidor próprio na porta 3211
npm run typecheck && npm run lint && npm run build
```

O Playwright usa o Chromium já instalado em `%LOCALAPPDATA%\ms-playwright\chromium-1234` (o download de browsers falha nesta máquina). Para outro caminho, defina `PW_CHROMIUM`. Os e2e escrevem na base simulada; `npm run db:seed:demo` a restaura.

## Dados reais (refazer ou atualizar a competência)

Com o servidor parado (o PGlite aceita um processo por vez):

```bash
npm run receita:baixar -- 2026-10        # baixa ~6,8 GB da RFB e filtra em streaming (~40 min)
npm run db:seed:base                     # base real nova: só organização, usuários e pesos
npm run receita:importar -- --estab .data/receita/2026-10/ESTABELE-filtrado.csv \
  --empresas .data/receita/2026-10/EMPRESAS-filtrado.csv --centroides .data/ref/centroides-siafi.csv \
  --recorte icp-enxuto --competencia 2026-10
npm run receita:sites -- --exportar      # domínios candidatos a site
npm run receita:sites -- --testar        # pode rodar com o servidor no ar (~1 h)
npm run receita:sites -- --aplicar       # servidor parado
```

`.data/ref/centroides-siafi.csv` é gerado de `github.com/kelvins/municipios-brasileiros` (base IBGE, código SIAFI). Detalhes em `docs/FONTES-DE-DADOS.md`. Amostra fictícia para testar o importador em `app/tests/fixtures/receita/`.

## Produção

Defina `DATABASE_URL` (Postgres gerenciado), rode `npm run db:migrate` e `docs/sql/postgis-producao.sql`, e troque a autenticação conforme o ADR-003 antes de abrir para usuários reais.
