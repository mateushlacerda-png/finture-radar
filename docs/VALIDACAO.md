# Validação do MVP (Etapa 5)

Data: 2026-10-23. Ambiente: Windows 11, Node 24.19, Next.js 16.4.2, PGlite (base de demonstração), Chromium 1234.

## Testes executados

| Suíte | Comando | Resultado |
|---|---|---|
| Unidade (score, filtros, layout da Receita) | `npm test` | **23/23 passaram** |
| Fluxos e2e (Playwright) | `npm run test:e2e` | **10/10 passaram** |
| Tipagem | `npm run typecheck` | sem erros |
| Lint | `npm run lint` | sem erros nem avisos |
| Build de produção | `npm run build` | ok, 12 rotas + proxy |
| Importador da Receita (amostra fictícia, dry-run) | ver README | 4 lidos, 1 inativo e 1 fora do recorte descartados, 2 aceitos com campos corretos |

### Critérios de aceite do PRD × teste que comprova

| # | Critério | Como foi verificado |
|---|---|---|
| 1 | Login e rota protegida | e2e "rota protegida…": `/crm` sem sessão vai para `/login?next=/crm`; senha errada mostra erro; API responde 401 |
| 2 | Filtros combinados atualizam mapa, lista e URL | e2e "radar filtra…": Parceiros + RJ + score 60 reduz o total, URL guarda os 3 filtros, lista só traz /RJ |
| 3 | Ficha com 5 scores, origem e fato/estimativa | mesmo teste: 5 abas de score, selo "Dado simulado", critério "Perfil de parceiro" com origem "Premissa", funcionários marcado "estimativa" |
| 4 | Salvar em lista | e2e "salvar em lista nova…" |
| 5 | Adicionar ao CRM | e2e "adicionar ao CRM…" |
| 6 | Mover etapa e persistir | mesmo teste: seletor do card move para Primeiro contato; depois do reload continua lá; histórico mostra a mudança |
| 7 | Registrar contato e tarefa | mesmo teste: ligação registrada, tarefa criada com data e concluída |
| 8 | Descartar e recuperar | e2e "descartar…": some da busca padrão, aparece com `status=descartado` |
| 9 | Dashboard e período | e2e "dashboard…": KPIs e funil; 12 meses mostra mais leads qualificados que 90 dias |
| 10 | Calibração por papel | e2e "calibração…": executiva vê campos desabilitados; admin zera 4 pesos de Saúde, score da ficha muda; pesos voltam ao padrão |
| 11 | CSV com filtros | e2e "exportação CSV…": content-type CSV, cabeçalho, todas as linhas RJ, coluna "Dado simulado" = SIM |
| 12 | Selo de dado simulado | faixa fixa no topo de todas as telas, selo na ficha, no card do CRM, na lista e no CSV |
| extra | Isolamento multi-tenant | e2e "isolamento…": usuário da Organização B não vê CRM nem listas da Finture, e a API devolve 0 para a lista da outra organização |
| extra | Mobile | e2e "mobile…": 390 px sem rolagem horizontal, abas Lista/Mapa, ficha em tela cheia |

## Problemas encontrados e corrigidos durante a validação

1. Mapa com altura zero: a classe `maplibregl-map` força `position: relative` e anulava `absolute inset-0`.
2. Worker do MapLibre 6 não era servido (o bundler não copia); passou a ser copiado para `public/maplibre` no `predev`/`prebuild`.
3. Funções e constantes exportadas de módulo `"use client"` chamadas no servidor (`cx`, paleta dos gráficos): movidas para módulos neutros.
4. Score lento (683 ms para 4.756 empresas) por criar `Intl.NumberFormat` a cada critério; com formatador único e cache por versão de pesos, a consulta sem filtro caiu para ~0,4 s em dev.
5. Score geral pouco seletivo (83% da base em 60+); pesos padrão do geral ajustados para aderência 50, qualidade 25, porte 25. Distribuição atual: 6% abaixo de 40, 30% entre 40 e 59, 44% entre 60 e 79, 20% em 80+.
6. Checkbox de tarefa só mudava depois do servidor; agora é otimista com reversão em caso de erro.
7. Selo "demo" do card seguia a oportunidade e não a empresa; corrigido.

## O que funciona de verdade

Login com papéis, isolamento por organização, Radar com mapa clusterizado e lista sincronizada, 13 filtros combináveis na URL, busca por nome/CNPJ, ficha completa, motor de score explicável e calibrável com versões, listas, pesquisas salvas, CSV, descarte e restauração, pedido LGPD de oposição/remoção, CRM com 2 funis e 9 etapas, arrastar e soltar e alternativa por seletor, notas, contatos, tarefas, responsável e próxima ação, dashboard com filtro de período, auditoria.

## Dados reais carregados (2026-10-23)

| Item | Resultado |
|---|---|
| Fonte | Dados Abertos do CNPJ, RFB, competência 2026-10 |
| Recorte | ICP enxuto: investimento, gestoras e auxiliares financeiros (Brasil), imobiliárias (RJ), clientes EPP e médio/grande (RJ) |
| Empresas | 86.054 ativas, 100% geolocalizadas pela sede do município |
| Com telefone | 82.649 (96%) |
| Com e-mail | 72.655 (84%) |
| Com site confirmado | 11.746 (14%): 16.407 domínios próprios testados, 8.764 da segunda rodada + 1.339 da primeira |
| Sem nenhum contato | 3.368, exibidas como "Não consta" |
| LinkedIn da empresa (link no próprio site) | 2.663 sites, aplicados às empresas que usam esses sites |
| Descrição publicada no site | 5.773 sites |
| Briefing por IA | Sob demanda na ficha; 14,7 s a 24 s por empresa (Claude Code local) |
| Desempenho | Filtros em 0,2 a 0,8 s; 1,4 s na primeira carga |

E-mails não viram site quando são de webmail (39.366) ou de domínio compartilhado por mais de 3 empresas (14.164, em geral do contador). Os e2e continuam 10/10 na base simulada separada.

## O que depende de integração ou decisão externa

| Item | Situação | Depende de |
|---|---|---|
| Dados reais fora do recorte | 86 mil carregadas; o resto da base exige Postgres | Postgres + PostGIS para ampliar o recorte |
| Geolocalização precisa | Só centróide do município | CNEFE/IBGE ou geocodificador comercial |
| Funcionários, site, contato de decisor | Não existem em fonte pública | Provedor de enriquecimento (cotação + análise jurídica) |
| Produção | Roda só local (PGlite) | Postgres gerenciado com PostGIS, `DATABASE_URL`, deploy |
| Auth de produção | Auth própria mínima, sem limite de tentativas, 2FA nem convite | Better Auth ou Clerk (ADR-003) |
| CRM externo / WhatsApp | Só contratos de interface (`src/lib/integrations`) | Credenciais e API do hub-partner; conta WhatsApp Business |
| Base legal | Rascunho em `LGPD.md` | Validação do jurídico/encarregado |
| Área logada da referência | Não analisada | Conta no radar.rctech.cc, se o usuário quiser |

## Riscos conhecidos

- PGlite é processo único: não abrir o seed com o servidor rodando (o seed apaga e recria `.data/pglite`).
- Mapa base vem de `tiles.openfreemap.org` (sem chave). Sem internet, a lista funciona e o mapa mostra aviso.
- O mapa recebe todos os pontos filtrados. Acima de ~10 mil pontos, trocar por consulta por viewport no PostGIS (`docs/sql/postgis-producao.sql`).
- Os testes e2e escrevem na base de demonstração; rode `npm run db:seed` para voltar ao estado inicial.
