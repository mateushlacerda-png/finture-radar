# CLAUDE.md — Radar Finture

Inteligência comercial B2B da Finture: empresas reais da Receita Federal priorizadas por score explicável, com mapa, ficha, briefing por IA, listas e CRM.

Esta pasta é a **cópia de trabalho** do projeto, criada em 2026-10-27 a partir de `Desktop\AIOS Core\artifacts\finture-radar`. O original ficou lá como referência e não recebe mais alterações. A matriz `Desktop\AIOS Core` (`AGENTS.md`, `CLAUDE.md`) continua sendo a regra superior para marca e conteúdo.

## Antes de mexer

1. Leia `AI_HANDOFF.md` (mais recente no topo). Atualize-o ao fim de toda rodada com alterações.
2. Para decisões técnicas, leia `docs/ARQUITETURA.md`. Para dados, `docs/FONTES-DE-DADOS.md`. Para privacidade, `docs/LGPD.md`. Para o que já foi testado, `docs/VALIDACAO.md`.

## Guardrails (herdados da Finture)

- **Nunca inventar dado de empresa.** Dado real vem da Receita ou do site da própria empresa, com fonte. Dado simulado só existe na base demo e é marcado.
- **Zero comissão.** Nunca citar comissão, repasse ou percentual em texto da interface ou do briefing por IA.
- **Solução antes do produto** nas abordagens: comece pelo objetivo do cliente, não pela apólice.
- **Sem travessão** visível nos textos.
- **ICP B2B:** sócio de escritório de investimento, family office, consultoria CVM ou imobiliária, tratado como potencial parceiro white-label.
- **LinkedIn:** só o link publicado no site da empresa. Não raspar o LinkedIn nem guardar perfis pessoais (`/in/`).
- Marca: laranja `#EA622D`, preto `#1B1A1A`, creme `#F8F1E7`, vinho `#A3221E`; IBM Plex Sans (títulos) + Space Grotesk (texto).

## Comandos (dentro de `app/`)

```bash
npm run build && npm run start   # http://localhost:3210, base REAL (.data/pglite)
npm run dev:demo                 # porta 3211, base SIMULADA (.data/pglite-demo)
npm test                         # vitest
npm run test:e2e                 # Playwright, sempre na base simulada
npm run typecheck && npm run lint
```

Produção: **https://finture-radar.vercel.app** (Vercel, projeto `finture-radar`, funções em `gru1`), banco Neon `finture-radar-db` ligado só a production/preview. Deploy: `vercel deploy --prod` dentro de `app/`. Não puxe `DATABASE_URL` para `.env.local`: o servidor local passaria a gravar no Neon. Briefing por IA fica desligado na Vercel (`RADAR_AI=1` liga quando houver API). Base: recorte `icp-brasil` (~538 mil empresas, 274 MB no Neon); atualização mensal pelo workflow `.github/workflows/receita-mensal.yml` (GitHub `mateushlacerda-png/finture-radar`, privado).

Na Vercel o site abre **sem login** (`RADAR_ACESSO_ABERTO=gestor@finture.demo`) até a integração com o hub; local e testes seguem com login. Usuários (senha `radar-demo-2026`): `admin@finture.demo`, `gestor@finture.demo`, `juliana@finture.demo`, `bruno@finture.demo`.

## Armadilhas desta máquina

- **PGlite é processo único.** Pare o servidor antes de qualquer script que grave no banco (seed, importação, `--aplicar`). Os scripts lentos (`--testar`, `--coletar`) não tocam o banco e podem rodar com o servidor no ar.
- **Pouca RAM.** O Claude Code encerra tarefas de segundo plano por falta de memória. O processo `node` costuma sobreviver; confira antes de reiniciar.
- **Briefing por IA** usa `claude -p` local (sem chave de API): `--restricted`, `--tools ""`, pasta temporária. Em produção, trocar `runClaude` em `app/src/lib/ai/overview.ts` pela API da Anthropic.
- **Playwright** usa o Chromium 1234 já instalado; o download de browsers falha aqui.
- **Zips brutos da Receita** (6,4 GB) ficaram fora da cópia. Os CSVs filtrados estão em `app/.data/receita/2026-10/`; para outra competência, `npm run receita:baixar`.
