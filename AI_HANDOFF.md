# AI_HANDOFF: Finture Radar

## 2026-10-27 (noite) — Clientes e imobiliárias do Brasil (recorte icp-brasil) e desempenho

- **Pedido do usuário:** clientes só apareciam no RJ; expandir para o Brasil (plano A: clientes médio/grande) e, se coubesse no plano grátis da Neon, imobiliárias do Brasil também.
- **Recorte `icp-brasil`** (`scripts/import-receita.ts`): contém o icp-enxuto inteiro (nada saiu) + imobiliárias do Brasil em EPP/médio-grande + clientes do Brasil em médio/grande. **537.851 empresas** (antes 86.054): 69.688 parceiros, 468.163 clientes. Neon: **274 MB de 512 MB**. Workflow mensal já usa esse recorte (com `NODE_OPTIONS` 4 GB na importação).
- **Desempenho (a base 6x maior deixava a busca em ~4 s e a primeira carga em ~20 s por servidor):**
  - `rankCompanies`: busca ordenada guardada 5 s (`queries/ranking-cache.ts`), compartilhada por lista e mapa; toda action limpa o cache (`actions/_util.ts`).
  - Sem cópia das linhas por busca (`Hit = { r, status, nova }`); só a página vira `RadarRow` (`all` é getter, para CSV e listas).
  - Ordenação por baldes de score sobre a base já em ordem alfabética (ordem feita no SQL em `loadBaseRows`).
  - Score por perfil (`perfilDoScore` em `scoring/engine.ts`): poucos milhares de perfis em vez de 537 mil cálculos. `tests/unit/scoring-perfil.test.ts` garante que o perfil cobre tudo o que o motor lê; **ao mudar um critério, atualizar a chave**.
  - Mapa: JSON montado de texto pronto na base; no máximo 120 mil pontos (os de maior score), com aviso na tela; lista chega sem esperar o mapa.
  - Páginas não carregam a base: municípios e novidades por SQL; aderência do Dashboard e distribuição da calibração vêm de `/api/companies/aderencia`. Versão da base conferida a cada 30 s. `vercel.json` com `fluid: true`.
- **Medido na Vercel (quente):** Radar clientes Brasil lista 1,4 a 2,6 s, mapa ~5 s; parceiros ~1,8 s; dashboard 0,8 s + aderência; páginas < 2 s.
- **Limite conhecido:** primeira chamada da API depois de um deploy ou de ociosidade recarrega a base: **~15 a 20 s**. Próximo passo se incomodar: snapshot pré-processado da base (Blob) ou fase 2 (filtro no SQL).
- **Atenção:** só as 11.746 empresas da base antiga têm site verificado; as novas ainda não passaram pelo `enriquecer-sites`, então a "qualidade do dado" favorece as do RJ no score Geral até rodar o enriquecimento.
- **Testes:** typecheck, lint, 39/39 unidade, e2e 10/10 (CRM passou ao repetir, timeout de teardown por memória da máquina).

## 2026-10-27 (noite) — Atualização mensal automática da Receita

- **Pedido do usuário:** atualizar a base sozinha; repositório privado no GitHub; marcar empresas novas e tirar do Radar as que fecharam. Mensal.
- **Feito (código, testado localmente):**
  - Migração `0003_entrou_em`: coluna `companies.entrou_em` (competência em que a empresa entrou pela atualização mensal; nula = carga inicial).
  - `scripts/receita-verificar.ts`: acha a competência mais recente **completa** no WebDAV da RFB (confere os 21 zips, com retentativa) e compara com a última carga do banco; `--exportar-cnpjs` lista os CNPJs já na base.
  - `receita-baixar-filtrar.py`: `--base-cnpjs` grava `ESTABELE-base.csv` (CNPJs da base que deixaram de ser ativos); `--apagar-zips` libera disco.
  - `import-receita.ts`: `entrou_em` só quando já houve carga de outra competência; `--base` atualiza situação (baixada, suspensa, inapta) das empresas já na base; registra novas/atualizadas em `ingestion_runs`.
  - `enriquecer-sites.ts` e `coletar-sites.ts`: `--entrou-em` processa só as empresas novas.
  - App: Radar esconde empresa não ATIVA (ficha e CRM seguem abrindo); cache de score zera quando a base muda; filtro `recentes=1` ("Só as novas na base"), etiqueta, selo "Nova na base" na lista, botão "N novas" na barra e aviso na pergunta inicial.
  - `.github/workflows/receita-mensal.yml`: toda segunda 06:00 (Brasília); só trabalha quando há competência nova. Manual: `competencia` e `simular` (padrão: simular).
  - Coordenadas dos municípios copiadas para `app/scripts/ref/centroides-siafi.csv` (antes só em `.data`).
  - Git iniciado na raiz; repositório privado **github.com/mateushlacerda-png/finture-radar** criado.
- **Testes:** typecheck, lint, 37/37 unidade, 10/10 e2e (demo). Simulação de 3 meses num PGlite temporário: carga inicial sem "nova", mês 2 com 1 nova, mês 3 com 1 baixada. Interface conferida na demo (marcação temporária desfeita).
- **Pendente (bloqueado por permissão ou login):**
  1. `git push`: o `gh` não tem o escopo `workflow`. Rodar `gh auth refresh -h github.com -s workflow` e depois `git push -u origin main`.
  2. Migração 0003 no Neon (`npx drizzle-kit migrate` com a URL do Neon) **antes** do próximo deploy; o app novo lê `entrou_em`.
  3. `vercel deploy --prod` da versão nova.
  4. Segredo `DATABASE_URL` no GitHub (URL sem pooling do Neon) e uma execução manual com `competencia=2026-10` e `simular=true` para validar o pipeline.

## 2026-10-27 (noite) — Razão social no lugar de nome fantasia inválido

- **Pedido do usuário:** mostrar a razão social quando o nome fantasia for só símbolo ("...", "****", "-").
- **Feito:** regra única em `src/lib/nome.ts` (`nomeExibicao`, `fantasiaValida`: o fantasia precisa ter ao menos duas letras). Aplicada na lista e no CSV (`queries/companies.ts`), na ficha (subtítulo com a razão social só aparece quando o nome é o fantasia), no texto factual, no prompt do briefing, no kanban (`queries/crm.ts`, agora resolvido em JS) e na página da oportunidade.
- **Score:** a pedido do usuário, o critério "nome fantasia" de `qualidadeDoDado` (`lib/scoring/engine.ts`) usa a mesma regra; "****" conta como faltando.
- **Testes:** typecheck, lint, 37/37 unidade (4 novos em `tests/unit/nome.test.ts`). Deploy na Vercel conferido no navegador. O servidor local em 3210 ainda roda o build anterior.

## 2026-10-27 (noite) — Deploy na Vercel com Neon

- **Pedido do usuário:** subir para a Vercel para parar de depender desta máquina.
- **Escolhas do usuário:** base real; briefing por IA desligado por ora; Neon criado na conta dele; **senha `radar-demo-2026` mantida** (alertado de que, online, qualquer um com a senha entra e vê contatos da Receita).
- **Feito:**
  - Projeto Vercel `finture-radar` (conta mateushlacerda-6019), produção em **https://finture-radar.vercel.app**. Funções em `gru1` (`app/vercel.json`).
  - Neon `finture-radar-db` via Marketplace, região `gru1`, ligado só a production e preview (`DATABASE_URL` não vai para `.env.local`, para o servidor local seguir em PGlite).
  - `scripts/copiar-para-postgres.ts`: migrações + COPY por tabela em ordem de FK, confere contagens, acerta sequências, recusa destino com dados. Copiadas 86.054 empresas, 5 usuários, 2 briefings, pesos e auditoria (sessões não).
  - Briefing por IA: `iaDisponivel()` em `src/lib/ai/overview.ts` (desligado quando `VERCEL` está definido, a menos que `RADAR_AI=1`); a ficha mostra "Disponível em breve".
  - `app/.vercelignore` tira `.data`, `node_modules` e artefatos do upload.
- **Testado online:** login, pergunta inicial, lista e mapa de parceiros, ficha real. Sem erro nos logs.
- **Atenção:**
  - A partir de agora há **duas bases reais**: a local (PGlite) e a da Vercel (Neon). O que a equipe registrar online (CRM, listas) fica só no Neon. Usar a Vercel como fonte principal.
  - Nova competência da Receita: importar localmente e copiar de novo exige um Neon vazio (o script recusa destino com dados); planejar um importador direto para Postgres.
  - Deploy: `cd app && vercel deploy --prod`. Não há git; o deploy sobe a pasta local.

## 2026-10-27 (tarde) — Radar: pergunta inicial e tela limpa

- **Pedido do usuário:** a tela do Radar mostrava tudo de cara. Ao entrar, perguntar se a pessoa procura parceiros ou clientes; depois abrir uma tela o mais clean e tech possível (referências de 21st.dev: Questionnaire, Minimal Welcome Onboarding, Expanded Map).
- **Feito:**
  - `components/radar/intro.tsx`: pergunta "Quem você quer encontrar hoje?" com cards Parceiros e Clientes (contagem ao vivo pela API, atalhos 1 e 2) e "Ver toda a base". Aparece quando `/radar` abre sem filtro nenhum; a página usa `key` pelos filtros, então clicar em Radar no menu volta à pergunta.
  - `radar-view.tsx` refeito: mapa em tela cheia; barra flutuante (Parceiros/Clientes/Todos com indicador deslizante, busca com atalho "/", Filtros com contagem, ações em ícones); filtros ativos como etiquetas removíveis; painel de filtros só sob demanda; lista flutuante recolhível; ficha em gaveta arredondada.
  - `filter-panel.tsx`: "Quem procurar" saiu (foi para a barra); bloco "O essencial" (solução, score, região, estado, cidade) e "Mais filtros" recolhível (perfil e situação). Slider de score estilizado.
  - `map-view.tsx`: prop `pad` centraliza o `fitBounds` no espaço livre e desloca controles, atribuição e legenda (agora em pílula horizontal).
  - e2e ajustados ao fluxo novo (pergunta inicial, abrir Filtros antes de escolher Estado).
- **Testes:** typecheck, lint, 10/10 e2e (um timeout de teardown no teste do CRM por lentidão do dev server; passou ao rodar de novo). Build de produção refeito e servidor da base real no ar em 3210.
- **Observação:** na base real há nomes fantasia como "...", "****" vindos da Receita; vale cair para a razão social quando o nome fantasia não tiver letras.

## 2026-10-27 — Revamp visual: cara tech, motion e sidebar nova

- **Pedido do usuário:** visual clean e tech, com motions em clique e sidebar, inspirado em 21st.dev, aplicando a skill emil-design-eng.
- **Feito (sem dependência nova, tudo em CSS + Tailwind):**
  - `globals.css`: curvas de movimento (`--ease-out`, `--ease-in-out`, `--ease-drawer`), malha de pontos, `.stagger`, `.pressable` (scale 0.97 no clique), `.lift` e `.spotlight` (só em hover com ponteiro fino), modal e toast com `@starting-style`, gaveta da ficha, skeleton com brilho. O movimento reduzido tira deslocamento e mantém só opacidade.
  - Sidebar recolhível (232/68 px), com indicador ativo que desliza, tooltips quando recolhida, cookie `radar_sidebar` lido no layout (sem piscar) e atalho Ctrl B (sem animação, por ser atalho).
  - Busca rápida Ctrl K: navegação e "buscar no Radar" (`/radar?q=`). Abre sem animação de propósito.
  - Topo com breadcrumb e aviso de base; dashboard com KPIs com holofote, barras que crescem, gráfico de área com gradiente; login com radar em varredura; Radar com ficha em gaveta, aba mobile deslizante e marca de seleção na lista; CRM com cards que sobem no hover.
- **Testes:** typecheck, lint, 33/33 unidade, 10/10 e2e (demo). Conferido no navegador, sem erros no console.
- **Observação:** os e2e gravaram na base demo; `npm run db:seed:demo` restaura. O servidor da base real (3210) ainda roda o build antigo: precisa de `npm run build && npm run start` para ver o visual novo.

## 2026-10-27 — Projeto movido para Desktop\Radar Finture

- **Pedido do usuário:** criar a pasta "Radar Finture" no Desktop para trabalhar no projeto.
- **Feito:**
  - Cópia de trabalho com `robocopy` a partir de `AIOS Core\artifacts\finture-radar`: 35.622 arquivos, 1,8 GB, nenhuma falha.
  - Ficaram de fora os zips brutos da Receita (6,4 GB, rebaixáveis) e o cache `.next`.
  - Foram junto: base real, base demo, CSVs filtrados, sites coletados e `node_modules`.
  - `CLAUDE.md` próprio com os guardrails da Finture e as armadilhas da máquina, porque a pasta fica fora do AIOS Core e não herda as regras da matriz automaticamente.
- **Testes na cópia:** typecheck e 33/33 de unidade.
- **Daqui em diante:** trabalhar só nesta pasta. O original em `artifacts/finture-radar` está congelado como referência.

## 2026-10-23 (noite) — LinkedIn, visão geral e briefing por IA

- **Pedido:** buscar o LinkedIn da empresa e trazer um overview para personalizar o atendimento.
- **Feito:**
  - Coleta da home dos 9.653 sites confirmados (`scripts/coletar-sites.ts`): título, descrição e LinkedIn e Instagram da empresa. Perfil pessoal (`/in/`) é ignorado; o LinkedIn em si não é acessado (termos de uso).
  - Botão "Buscar no LinkedIn" em toda ficha.
  - Bloco "Visão geral" na ficha: texto factual (cadastro + descrição do próprio site) e "Briefing para o primeiro contato" por IA, sob demanda.
  - A IA roda via `claude -p` local (escolha do usuário; não há chave de API): sem ferramentas, `--restricted`, em pasta temporária. O resultado fica salvo por organização (`company_overviews`).
  - Migração 0002 (colunas de site/LinkedIn e tabela de overviews).
- **Testes:** 33 de unidade, incluindo o extrator do site e o overview factual. O briefing foi gerado de ponta a ponta pela interface em 24 s; teste isolado em 14,7 s.
- **Riscos:**
  - o briefing por IA só funciona nesta máquina, com o Claude Code logado;
  - em produção, trocar por API (`src/lib/ai/overview.ts`, função `runClaude`).

## 2026-10-23 (tarde) — Dados reais da Receita e sites

- **Ferramenta:** Claude Code (Opus 5.5).
- **Pedido:** trocar a demo por empresas reais; buscar site e contato; mostrar "Não consta" quando não houver.
- **Feito:**
  - Achado o endereço novo da RFB (Nextcloud público, WebDAV). Baixada a competência 2026-10 (6,8 GB) e filtrada em streaming (`scripts/receita-baixar-filtrar.py`).
  - Importadas **86.054 empresas** no recorte "ICP enxuto", escolhido pelo usuário porque o recorte original dava cerca de 1 milhão.
  - Geolocalização pela sede do município, casada pelo código SIAFI (kelvins/municipios-brasileiros).
  - Sites: domínio do e-mail cadastral, confirmado por HTTP (`scripts/enriquecer-sites.ts`, 3 etapas). São 11.746 empresas com site. Google não foi usado (termos de uso).
  - "Não consta" na ficha e no CSV; CSV ganhou telefone, e-mail e site; tabela de naturezas jurídicas da Receita.
  - Bases separadas: real em `.data/pglite` e demo em `.data/pglite-demo`; os e2e usam a demo na porta 3211.
  - Base pública em memória no servidor (filtro em JS) e cache de score só com números. Aviso do topo muda conforme a base.
- **Testes:** unidade 23/23, e2e 10/10 na demo, typecheck, lint e build ok; números conferidos pelo CSV exportado.
- **Riscos:**
  - RAM da máquina no limite: o Claude Code derrubou tarefas de fundo três vezes.
  - Cluster de 8,9 mil pontos na cidade do RJ (precisão de município).
  - CRM e listas da base real estão vazios, por design: nenhuma oportunidade foi inventada sobre empresa real.
- **Próximo passo:** Postgres + PostGIS para ampliar o recorte; geocodificar por CEP (CNEFE).

## 2026-10-23 — Criação do projeto: análise da referência, PRD, arquitetura e MVP

- **Ferramenta:** Claude Code (Opus 5.5), Playwright MCP para a referência e para revisão visual, Playwright Test para e2e.
- **Objetivo:** pedido do usuário (prompt "FINTURE RADAR"): analisar radar.rctech.cc, documentar, planejar e construir um MVP próprio de inteligência comercial B2B para a Finture.
- **Referência:** `/app` exige login (401 em `/api/me`). Não foi criada conta. Analisada só a parte pública; as imagens de produto da landing são fotos ilustrativas, não telas reais. Ver `docs/ANALISE-REFERENCIA.md`.
- **Entregue:**
  - Documentos: `docs/ANALISE-REFERENCIA.md`, `PRD-FINTURE-RADAR.md`, `ARQUITETURA.md`, `FONTES-DE-DADOS.md`, `LGPD.md`, `VALIDACAO.md`, `sql/postgis-producao.sql`, `screens/`.
  - App em `app/`: Next.js 16.4.2, React 19, Tailwind 4, Drizzle + PGlite (dev) / Postgres (prod), MapLibre 6 + OpenFreeMap, Recharts, Zod.
  - Telas: login, dashboard, radar (mapa clusterizado + 13 filtros + lista + ficha), listas e pesquisas salvas, CRM kanban com 2 funis e 9 etapas, detalhe da oportunidade, configurações (calibração de pesos com versões e prévia, equipe, pedidos LGPD, auditoria).
  - Motor de score em `src/lib/scoring` (saúde, seguro, crédito, parceria, geral), com peso, evidência, origem e fato/estimativa por critério.
  - Importador da Receita (`scripts/import-receita.ts`) testado só com amostra fictícia, em dry-run.
- **Decisões:** ver ADRs em `docs/ARQUITETURA.md` (PGlite no dev, score em código, auth própria só no MVP, CNPJ como texto, sem valor em R$ por lead) e a seção "Desvios do plano".
- **Dados:** 100% simulados. Razão social com "DEMO", CNPJ com dígito verificador inválido de propósito, telefone com prefixo 0, domínios `.example`, `is_demo = true`, faixa de aviso em toda tela.
- **Testes:** unidade 23/23, e2e 10/10, typecheck, lint e build ok. Detalhe em `docs/VALIDACAO.md`.
- **Pendências:** confirmar o endereço atual do download do CNPJ na RFB (o caminho antigo deu 404); gerar centróides do IBGE; Postgres gerenciado + PostGIS; trocar auth (Better Auth/Clerk); validação jurídica da LGPD; integração com hub-partner e WhatsApp (só interfaces); análise da área logada da referência, se o usuário criar conta.
- **Riscos:** PGlite é processo único (parar o servidor antes do seed); o mapa recebe todos os pontos filtrados (ok até ~10 mil); os e2e escrevem na base demo (`npm run db:seed` restaura).
- **Recomendação:** antes de dado real, fazer a fase 2 na ordem: Postgres + PostGIS, ingestão de um recorte (UFs do Sudeste, CNAEs do ICP), revisão jurídica, auth de produção.
