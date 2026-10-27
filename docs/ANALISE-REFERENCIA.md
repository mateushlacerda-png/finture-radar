# Análise da referência: Radar de Leads (radar.rctech.cc)

Data da investigação: 2026-10-23. Ferramenta: Playwright (Chromium, 1440×900) + curl do HTML público.

## 0. Resumo honesto do alcance

| Item | Situação |
|---|---|
| `https://radar.rctech.cc/app` | **Não acessado.** Redireciona para `/?entrar=1`. As chamadas `GET /api/me` e `GET /api/geo` respondem **401**. O `robots.txt` também exclui `/app`, `/admin`, `/api/`. |
| Landing pública (`/`) | Verificada (texto, seções, planos, FAQ, CTAs). |
| Páginas de segmento (`/leads/<slug>`) | Verificada uma (`/leads/financeiro`). |
| Sitemap | Lido: landing, `leads-por-segmento`, `crm-vendas-externas`, `prospeccao-b2b`, `lista-de-empresas-por-cnae`, ~30 páginas `/leads/*`. |
| Imagens de "produto" da landing | São **fotos ilustrativas** (pessoa diante de um monitor com mapa-múndi; notebook com dashboard genérico). **Não são capturas reais da aplicação** e não servem como evidência de layout. |

A landing oferece trial de 14 dias com criação de conta. **Não criei conta**: exige cadastrar e-mail em serviço de terceiro em nome do usuário e aceitar termos. Se o usuário quiser a análise da área logada, o caminho é ele criar a conta (ou autorizar explicitamente) e repetir esta etapa logado.

Consequência: tudo abaixo sob "Funcionalidades declaradas" vem do **texto de marketing** do produto, não de uso observado. Nada disso foi copiado como fato verificado de comportamento de tela.

## 1. Funcionalidades declaradas pela referência (fonte: landing, FAQ e tabela de planos)

### Radar
- Mapa 2D e globo 3D; cada lead é um ponto **dimensionado pelo potencial**.
- **Perímetro desenhado** no mapa para restringir a área.
- Filtros por categoria, segmento, porte, praça (estado/cidade) e score.
- Score de 0 a 100 **explicado fator a fator**. Fatores declarados no FAQ: aderência ao segmento, capacidade (porte), potencial de compra, risco financeiro, força da praça, presença digital e, no agro, densidade agrícola.
- "Potencial de compra em R$/mês" por empresa (o hero mostra "Score 92 · imediato" e "R$ 706 mil / mês").
- Ficha da empresa com composição da nota, "mix recomendado" e próximo passo de abordagem.
- **Parecidos com seus clientes**: upload de lista de CNPJs para achar empresas de perfil semelhante (lookalike).
- **Listas salvas** com alerta por e-mail quando entram leads novos.
- Exportação CSV com os mesmos filtros da tela (cota por plano).
- Contato do decisor **revelado por crédito**; uma vez revelado, fica liberado para sempre.
- Painel de análise de segmentos (mercado por estado, cidade, porte, índice de risco) nos planos altos.
- API nos planos altos.

### CRM
- Kanban com arrastar e soltar; card nasce do lead revelado.
- Distribuição por vendedor ou território; vendedor vê só a própria carteira.
- Agenda com link público, sincronização Outlook/Google.
- Gravação de reunião com resumo por IA, próximo passo e probabilidade.
- Roteiros de visita pelo menor caminho (Google Maps).
- WhatsApp e atalhos de busca no LinkedIn a partir da ficha.
- Dashboard por vendedor (valor em negociação, ganhos do mês).
- E-mail marketing para contatos revelados.

### Dados e compliance (declarados)
- Base: cadastro público da Receita Federal, "cruzado" com IBGE, Banco Central e registro de inspeção federal; complemento com dados do site da própria empresa, com origem e grau de confiança na ficha.
- Contagens por segmento datadas (ex.: 49.795 instituições financeiras em 21/10/2026), com aviso de que o recorte "não representa o total de empresas do país".
- LGPD: registra origem de cada dado de contato de sócio/responsável, oferece opt-out e pedido de remoção.

### Modelo comercial (registrado só como contexto; **fora do escopo** do Finture Radar v1)
Trial grátis + 4 planos pagos, limitados por leads visíveis por consulta, estados por vez, exportações e contatos revelados por mês.

## 2. Estrutura das telas públicas (verificada)

**Landing**: nav fixa (âncoras: O problema, Como funciona, O radar, CRM, Para quem, Planos, Perguntas, Agendar demo, Entrar) → hero com promessa + 3 contadores animados (estabelecimentos, estados, score) + ilustração de mapa do Brasil → faixa de selos (Receita Federal, atualização mensal, LGPD, CRM incluso) → "problema × solução" em 6 pares → 4 passos (Universo, Contexto, Prioridade, Ação) → seção Radar → seção CRM → grade de 30 segmentos com emoji → tabela comparativa "planilha × radar" → planos + simulador de receita com 3 sliders → FAQ em `<details>` → CTA final → tabs Entrar/Criar conta.

**Página de segmento** (`/leads/financeiro`): breadcrumb, H1, 3 KPIs (empresas, estados, % com telefone), nota de data e recorte, tabela por UF (top 10), tabela por cidade (top 10), CNAEs incluídos, "como vender para o segmento", FAQ, links para outros segmentos. É uma página de SEO programático.

Capturas: `referencia/01-hero.png`, `referencia/02-radar.png`, `referencia/03-crm.png`. HTML bruto salvo em `referencia/*.html` apenas para consulta de texto; nada dele foi reaproveitado no código.

## 3. Microinterações observadas
- Contadores do hero partem de 0 e animam (no snapshot inicial aparecem "0", "0/100").
- Planos carregam por JS ("carregando planos…").
- FAQ com `<details name="faq">` (abre um por vez).
- Banner de cookies com recusa explícita, e anúncios só após consentimento.
- CSP restritiva no front (`script-src 'self'` + CDNs listados).

## 4. Componentes inferidos (não verificados na área logada)
Mapa com camada de pontos e clusters; barra de filtros; lista ranqueada; ficha lateral com score decomposto; kanban; agenda; painel de vendedor. **Layout real desconhecido.**

## 5. Oportunidades para a Finture (onde dá para ser superior no que importa)

1. **Score multiproduto**, não um único "potencial de compra". A Finture vende saúde coletiva, seguro empresarial, crédito/consórcio e, principalmente, distribuição white-label. Cada empresa ganha um score por solução, e o score geral combina aderência com **qualidade do dado**.
2. **Score com evidência e confiança separadas.** Cada critério mostra: o dado usado, a origem (Receita, enriquecimento, inferência) e se é fato ou estimativa. A referência promete "sem caixa-preta"; nós mostramos também o que **não sabemos**.
3. **Dois funis no mesmo CRM**: cliente final (empresa que compra a solução pelo parceiro) e parceiro de distribuição (escritório de investimento, family office, consultoria CVM, imobiliária). Etapas e linguagem próprias para cada um, seguindo a regra editorial "solução antes do produto".
4. **Calibração de pesos pela própria operação**, com caminho para modelo preditivo quando houver histórico de ganhos/perdas.
5. **Sem "potencial em R$/mês" inventado.** A referência mostra valor monetário estimado por lead; sem dado de faturamento real, isso induz a erro. O Finture Radar mostra faixas de porte e deixa explícito quando é estimativa.
6. **Sem crédito por contato no v1.** Contato que veio de fonte pública aparece com origem; contato pessoal de sócio não é exibido sem base legal registrada.
7. **Marcação de dado simulado** visível em toda tela do ambiente de demonstração.

## 6. Limitações desta investigação
- Área logada não inspecionada (sem credenciais). Não houve tentativa de contornar autenticação nem de consumir `/api/*`.
- Responsividade, estados de carregamento, gestão de equipes e exportação da aplicação real **não verificados**.
- Fórmula e pesos do score da referência são desconhecidos; só a lista de fatores está publicada.

## Fontes
- https://radar.rctech.cc/ (landing, FAQ, tabela de planos), acessado em 2026-10-23
- https://radar.rctech.cc/leads/financeiro, acessado em 2026-10-23
- https://radar.rctech.cc/robots.txt e /sitemap.xml
