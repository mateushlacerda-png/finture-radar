# Finture Radar: LGPD e compliance

> **Status:** rascunho técnico para validação do jurídico/encarregado (DPO) da Finture. Os artigos citados são da Lei 13.709/2018 (LGPD) e precisam ser conferidos contra o texto vigente e as orientações da ANPD antes de a plataforma operar com dado real. Nada aqui é parecer jurídico.

## 1. Que dado o Radar trata

| Categoria | Exemplo | É dado pessoal? | No MVP |
|---|---|---|---|
| Cadastro da pessoa jurídica | razão social, CNPJ, CNAE, porte, endereço comercial | Em regra não (a LGPD protege pessoa natural) | Sim (simulado) |
| Contato cadastral da empresa | telefone e e-mail do cadastro CNPJ | Pode ser, quando identifica uma pessoa (ex.: e-mail nominal, MEI, empresário individual) | Sim (simulado, domínio .example) |
| Sócios e administradores (QSA) | nome, qualificação | **Sim** | **Não importado** |
| Contato pessoal de decisor (enriquecimento) | celular, e-mail pessoal | **Sim** | **Não existe no MVP** |
| Usuários da plataforma | nome, e-mail, ações | Sim | Sim |
| Histórico comercial | notas de ligação, reuniões | Pode conter | Sim |

Regra de produto: **minimização**. O Radar só traz o que serve para decidir a abordagem. QSA e contato pessoal ficam fora até haver base legal documentada.

## 2. Base legal proposta (a validar)

- **Prospecção B2B com dado cadastral público:** legítimo interesse (art. 7º, IX), com teste de balanceamento (LIA) documentado, conforme art. 10. Dados de acesso público exigem respeito à finalidade, boa-fé e interesse que justificaram a publicação (art. 7º, §3º).
- **Usuários e histórico comercial:** execução de contrato com a organização cliente e legítimo interesse para segurança e auditoria.
- **Enriquecimento pago (fase 3):** só com contrato que garanta origem lícita, base legal do fornecedor e suporte a exclusão; registro de origem por campo.

## 3. Direitos do titular e oposição

Implementado no MVP:

- **Registro de oposição ou remoção** na ficha da empresa (perfis Admin e Gestor). O CNPJ entra em `suppressions` da organização e sai de todas as consultas, exportações e mapa daquela organização (`whereFor` em `src/lib/queries/companies.ts`). O pedido guarda quem pediu, por qual canal, quem registrou e quando.
- Lista de pedidos em Configurações.
- O titular pode se opor a tratamento feito sem consentimento (art. 18, §2º); demais direitos do art. 18 (acesso, correção, eliminação) são atendidos pelo canal do encarregado (art. 41), com prazo e fluxo a definir pelo jurídico.

A fazer antes de operar com dado real:

- Canal público de contato do encarregado e aviso de privacidade.
- Supressão **global** (entre organizações) quando o pedido for contra a Finture como controladora.
- Rotina de eliminação: remoção física do dado de contato pessoal após pedido, não só ocultação.

## 4. Rastreabilidade e retenção

- **Auditoria** (`audit_events`): descarte, restauração, contato registrado, criação/movimento de oportunidade, criação/exclusão de lista, exportação CSV (com filtros e número de linhas), calibração do score e pedidos LGPD. Atende ao registro das operações (art. 37).
- **Origem do dado:** cada empresa tem `source` e `source_ref` (ex.: `RFB dados abertos CNPJ 2026-10`); cada critério do score mostra a origem na ficha.
- **Retenção proposta:** histórico comercial enquanto houver relação comercial + 5 anos; logs de auditoria 5 anos; dado cadastral atualizado a cada competência da Receita, com empresas baixadas marcadas e não excluídas (para não reabordar). **Prazo a validar.**

## 5. Segurança (art. 46)

| Controle | Situação |
|---|---|
| Senha com scrypt e salt por usuário | Implementado |
| Sessão opaca (token aleatório, só hash no banco, cookie httpOnly, SameSite=Lax, Secure em produção, 12 h) | Implementado |
| Isolamento por organização em toda consulta de dado de trabalho | Implementado e testado (e2e "isolamento multi-tenant") |
| Permissão por papel (executivo não calibra, não registra LGPD, só edita a própria oportunidade) | Implementado no servidor |
| Validação de entrada (Zod) em toda action e rota | Implementado |
| CSV protegido contra injeção de fórmula | Implementado |
| Cabeçalhos de segurança (nosniff, frame DENY, referrer, permissions) | Implementado |
| Mesma mensagem para usuário inexistente e senha errada | Implementado |
| Limite de tentativas de login, 2FA, convite de usuário | **Pendente** (ADR-003: Better Auth ou Clerk) |
| RLS no Postgres como defesa em profundidade | **Pendente** (`docs/sql/postgis-producao.sql`) |
| Criptografia em repouso | Depende do provedor de Postgres gerenciado |

## 5.1 Site, LinkedIn e briefing por IA

- Só lemos o site institucional da própria empresa (página inicial e página "sobre"). O LinkedIn não é acessado; o link vem do rodapé do site.
- Perfis pessoais de LinkedIn (`/in/`) são descartados na extração. Nomes de pessoas não entram no briefing, e o prompt proíbe citá-los.
- O briefing por IA é gerado sob demanda, registrado na auditoria (`gerar_overview_ia`), marcado como gerado por IA e acompanhado das fontes.

## 6. Uso comercial

- Contato cadastral não é tratado como "contato do decisor" na interface.
- Mensagem ativa por WhatsApp só com template aprovado e opt-in (ver `src/lib/integrations`).
- Material que sai da casa segue os guardrails da Finture (zero comissão, estatística creditada, público separado).
