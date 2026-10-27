# PRD: Finture Radar

Versão 1.0 · 2026-10-23 · Status: MVP em construção

## 1. Objetivo

Dar ao time comercial da Finture um lugar único para **decidir quem abordar, por quê e com qual solução**, e acompanhar a abordagem até o fechamento.

Dois usos, com funis separados:

- **Parceiro de distribuição (B2B white-label).** Encontrar escritórios de investimento, family offices, consultorias de valores mobiliários (CVM) e imobiliárias com perfil para levar as soluções da Finture aos clientes deles. É o uso prioritário.
- **Cliente final empresa.** Encontrar empresas com aderência a saúde coletiva, seguro empresarial e crédito, para indicação ao parceiro da região ou atendimento direto.

Indicador de sucesso do MVP: o comercial monta uma lista priorizada de uma praça, entende o motivo de cada nota e leva os leads ao CRM sem sair da ferramenta.

## 2. Perfis de usuário

| Perfil | Precisa de | Permissões |
|---|---|---|
| **Admin** (diretoria comercial/marketing) | Visão executiva, calibrar pesos do score, gerir usuários | Tudo |
| **Gestor comercial** | Distribuir leads, acompanhar pipeline e desempenho do time | Tudo, exceto gestão de organização |
| **Executivo comercial** | Encontrar e priorizar leads, registrar contatos, mover oportunidades | Radar, listas, CRM; edita só oportunidades em que é responsável; não calibra score |

## 3. Jornadas principais

1. **Mapear uma praça.** Abre o Radar → filtra UF, cidade, tipo (parceiro) e score mínimo → vê clusters no mapa e a lista ranqueada → abre a ficha → lê a justificativa do score → salva numa lista.
2. **Qualificar e levar ao CRM.** Na ficha, clica "Adicionar ao CRM", escolhe o funil (parceiro ou cliente), a solução e o responsável → card nasce em "Lead identificado".
3. **Trabalhar o funil.** No Kanban, arrasta o card entre etapas, registra contato, cria tarefa com data, anota próximos passos. Cada movimento vira histórico.
4. **Descartar com motivo.** Lead fora do perfil é descartado com motivo e some dos resultados padrão (filtro "mostrar descartados" o traz de volta).
5. **Acompanhar.** Gestor abre o Dashboard → filtra período → vê pipeline por solução, conversão por etapa, oportunidades por UF/cidade e desempenho por responsável.
6. **Calibrar.** Admin ajusta pesos de critérios de um score → vê a prévia da distribuição de notas → salva. Os scores passam a usar os novos pesos.
7. **Oposição LGPD.** Recebe pedido de oposição/remoção → registra na ficha → a empresa sai do Radar da organização e o pedido fica auditado.

## 4. Funcionalidades

### 4.1 Radar (mapa + lista)
- Mapa do Brasil (MapLibre, base OpenFreeMap) com clusters que expandem com zoom; cor do ponto pela faixa do score geral, tamanho pelo score.
- Lista ranqueada sincronizada com os filtros, paginada.
- Filtros combináveis: UF, cidade, região, CNAE, setor, porte, faixa de funcionários (estimada), tempo de atividade, score mínimo (geral ou por solução), solução de interesse, tipo de lead (parceiro/cliente), já prospectadas, descartadas, com contato disponível.
- Filtros na URL (link compartilhável), salvar pesquisa com nome.
- Exportar CSV com os filtros ativos.

### 4.2 Motor de score
- Cinco scores: Saúde empresarial, Seguro empresarial, Crédito, Parcerias, Geral.
- Cada score = média ponderada de critérios; cada critério expõe peso, pontos, evidência (o dado usado), origem e se é **fato** ou **estimativa**.
- Score geral = combinação configurável de aderência (melhor solução), qualidade do dado e porte.
- Selo de confiança (alta/média/baixa) conforme a proporção de critérios com dado real.
- Pesos calibráveis por organização, versionados.
- Crédito: o texto explica que o score mede **compatibilidade**, não necessidade financeira.

### 4.3 Ficha do lead
Identificação e cadastro; indicadores; scores com justificativa; soluções recomendadas; contatos cadastrais com origem; histórico; responsável; status; próximas ações. Ações: salvar em lista, adicionar ao CRM, registrar contato, descartar, registrar oposição (admin/gestor).

### 4.4 Listas
Criar, renomear, excluir lista; adicionar/remover empresas; ver lista no Radar; exportar CSV.

### 4.5 CRM
- Kanban com 9 etapas (Lead identificado → Ganho/Perdido), arrastar e soltar, alternância entre funil Parceiro e Cliente final.
- Card: empresa, solução, responsável, próxima ação e data.
- Detalhe da oportunidade: notas, registro de contato (ligação, e-mail, WhatsApp, reunião), tarefas com data, mudança de responsável, motivo de perda.
- Filtro "minhas oportunidades".

### 4.6 Dashboard gerencial
KPIs (empresas mapeadas, leads qualificados, em prospecção, oportunidades abertas), pipeline por solução, conversão por etapa, oportunidades por UF e cidade, desempenho por responsável, evolução semanal, soluções com maior aderência na base. Filtro de período.

### 4.7 Fora do MVP (futuro)
Ingestão real da Receita (fase 2), geocodificação CNEFE, enriquecimento pago, lookalike por lista de CNPJs, perímetro desenhado no mapa, alertas de novos leads, roteiro de visitas, agenda com Google/Outlook, WhatsApp Business API, integração com o CRM da plataforma Finture (hub-partner), modelo preditivo de score, app mobile. **Monetização e assinatura: fora do escopo.**

## 5. Requisitos não funcionais
- Multi-tenant: todo dado de trabalho (listas, CRM, status, pesos, auditoria) tem `org_id` e só é lido com o `org_id` da sessão, validado no servidor.
- Segurança: senha com scrypt, sessão em cookie httpOnly com token aleatório guardado como hash, validação de entrada com Zod em toda action, nenhum segredo no bundle do cliente.
- Auditoria de ações sensíveis (descarte, oposição, calibração, mudança de etapa).
- Desempenho: mapa fluido com até 10 mil pontos no cliente (clusters na GPU); acima disso, clusterização no servidor (fase 2, PostGIS).
- Acessibilidade: navegação por teclado nos filtros, lista e kanban (mover por menu além de arrastar), contraste AA, foco visível.
- Responsivo: desktop (mapa + lista + ficha), tablet (ficha em sobreposição), mobile (abas Mapa/Lista, filtros em gaveta).
- Ambiente de demonstração: selo permanente "Dados simulados".

## 6. Critérios de aceite do MVP
1. Login com usuário de demonstração; rota protegida redireciona sem sessão.
2. Radar mostra pontos clusterizados; ao filtrar UF=RJ e score ≥ 60, mapa e lista atualizam e a URL guarda os filtros.
3. Clicar num ponto ou item da lista abre a ficha com os 5 scores e os critérios com origem e marcação fato/estimativa.
4. "Salvar em lista" cria ou usa uma lista; a lista aparece em /listas com a empresa.
5. "Adicionar ao CRM" cria oportunidade no funil escolhido; o card aparece no Kanban.
6. Arrastar o card muda a etapa e grava no histórico; recarregar a página mantém a etapa.
7. Registrar contato e criar tarefa aparecem no histórico da oportunidade.
8. Descartar remove a empresa do Radar padrão; o filtro "descartadas" a traz de volta.
9. Dashboard mostra KPIs e gráficos coerentes com o banco; filtro de período altera os números.
10. Admin altera um peso, salva, e o score da ficha muda; executivo não acessa a calibração.
11. Exportar CSV baixa arquivo com as colunas e os filtros ativos.
12. Todas as telas trazem o selo de dado simulado.

## 7. Priorização

| Prioridade | Itens |
|---|---|
| MVP (esta entrega) | Auth demo multi-tenant, Radar com mapa/filtros/lista, ficha, motor de score explicável e calibrável, listas, pesquisas salvas, CRM kanban com notas/tarefas/contatos, dashboard, CSV, descarte, oposição LGPD, auditoria |
| Fase 2 | Ingestão Receita + geocodificação, PostGIS e clusters no servidor, Postgres gerenciado, convites de usuários, perímetro no mapa |
| Fase 3 | Enriquecimento pago, WhatsApp Business, agenda, integração hub-partner, lookalike, alertas |
| Fase 4 | Modelo preditivo treinado no histórico de ganhos/perdas |
