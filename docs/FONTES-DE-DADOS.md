# Fontes de dados do Finture Radar

Regra do projeto: **nenhum dado empresarial é inventado**. Fora do ambiente de demonstração, todo campo exibido carrega a origem. No ambiente de demonstração, todo registro tem `is_demo = true` e a interface mostra o selo "Dado simulado".

Legenda de verificação: **V** = verificado nesta rodada; **C** = conhecimento técnico consolidado, conferir antes de contratar; **?** = não verificado, precisa de cotação.

## 1. Fonte primária: Dados Abertos do CNPJ (Receita Federal)

| Aspecto | Detalhe |
|---|---|
| Origem | Receita Federal do Brasil, conjunto "Cadastro Nacional da Pessoa Jurídica", publicado no repositório de dados abertos da RFB (gov.br/receitafederal/dados) e no dados.gov.br. **V**: a página do repositório existe; o caminho antigo `arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/` respondeu **404** em 2026-10-23. **V (2026-10-23):** os arquivos estão num compartilhamento público Nextcloud: `https://arquivos.receitafederal.gov.br/index.php/s/gn672Ad4CF8N6TK`, pasta `Dados/Cadastros/CNPJ/<AAAA-MM>/`, também acessível por WebDAV público (`public.php/webdav`, usuário = token do link, sem senha). Competências de 2026-07 a 2026-10 disponíveis. |
| Frequência | Mensal (C). |
| Cobertura | Todas as empresas e estabelecimentos com CNPJ, ativos e baixados (C). |
| Conteúdo útil | Empresas (razão social, natureza jurídica, capital social, porte ME/EPP/Demais), Estabelecimentos (nome fantasia, situação cadastral e data, data de início de atividade, CNAE principal e secundários, endereço, CEP, município, telefone, e-mail), Simples/MEI, Sócios (nome, qualificação, CPF mascarado). Tabelas de domínio: CNAE, municípios, naturezas, qualificações (C). |
| O que **não** tem | Coordenadas geográficas, número de funcionários, faturamento, site. |
| Licenciamento | Dado aberto governamental (política de dados abertos do Executivo federal, Decreto 8.777/2016) (C). Tratamento de dado pessoal de sócio continua sujeito à LGPD. |
| Custo | Gratuito. |
| Volume | **V (2026-10):** Estabelecimentos 10 zips, 5,4 GB; Empresas 10 zips, 1,4 GB; Sócios 0,9 GB; Simples 0,3 GB (compactados). Ingestão em lote e em streaming (`scripts/receita-baixar-filtrar.py`). |
| Qualidade | Telefone e e-mail são autodeclarados no cadastro e frequentemente desatualizados ou do contador. Mostrar como "contato cadastral", nunca como "contato do decisor". |
| Mudança 2026 | CNPJ alfanumérico para empresas abertas a partir de julho de 2026 (IN RFB 2.229, V por busca). **O modelo de dados usa `cnpj` como texto de 14 caracteres alfanuméricos**, sem cast para número. |

## 2. Geolocalização

| Fonte | Uso | Licença/custo | Status |
|---|---|---|---|
| Sede dos municípios (lat/lng) com código SIAFI | Posição de fallback (precisão de município), casada pelo código que a Receita usa | `github.com/kelvins/municipios-brasileiros` (base IBGE, licença MIT) | **V**, em uso |
| IBGE: CNEFE (Cadastro Nacional de Endereços para Fins Estatísticos, Censo 2022) | Geocodificação por endereço/CEP com coordenada | Aberto, gratuito | C, conferir cobertura por CEP |
| Geocodificadores comerciais (Google, Mapbox, HERE) | Precisão de fachada | Pago por chamada, termos restringem armazenamento | ? |

Toda coordenada guarda `geo_precision` (`municipio`, `cep`, `endereco`). No mapa, ponto com precisão de município é desenhado com dispersão determinística e a ficha avisa.

## 3. Complementos públicos

| Fonte | Para quê | Status |
|---|---|---|
| IBGE (PIB municipal, população, CEMPRE) | Força da praça | C |
| CVM (dados abertos de participantes: consultores, gestores, administradores) | Confirmar consultoria CVM e gestoras no score de parceria | C |
| SUSEP (cadastro de corretores) | Identificar corretoras de seguro (concorrentes ou parceiras) | C |
| CRECI regionais | Imobiliárias registradas | ?, sem base nacional unificada aberta |
| ANS (dados abertos de operadoras e beneficiários) | Contexto de mercado de saúde por região | C |

## 4. Provedores de enriquecimento (contato, site, funcionários)

| Provedor | Tipo | Observação | Custo/limite |
|---|---|---|---|
| BrasilAPI | Gratuito, open source, proxy de dados da Receita | Só consulta por CNPJ; sem SLA | ? (limite não documentado na busca) |
| ReceitaWS | Gratuito com limite + planos pagos | Consulta por CNPJ | ? |
| CNPJá, cnpj.ws | Pagos | Consulta e listas | ? |
| Econodata, Speedio, Casa dos Dados, Neoway, BigDataCorp | Comerciais | Funcionários estimados, faturamento estimado, contatos | ?, exige cotação e análise contratual de base legal |

Antes de contratar qualquer provedor de contato pessoal: exigir contrato com cláusula de origem lícita e base legal, registro de origem por campo e suporte a remoção.

**Funcionários:** nenhuma fonte pública dá contagem por empresa (RAIS identificada é restrita). No Finture Radar o campo é `funcionarios_faixa_estimada` e **sempre** aparece como estimativa, com a fonte.

## 4.1 Site e contato (implementado)

- **Telefone e e-mail:** vêm do próprio cadastro CNPJ (o mesmo que uma "consulta CNPJ" devolve). Sem valor, a interface e o CSV mostram "Não consta".
- **Site:** derivado do domínio do e-mail cadastral e confirmado por acesso HTTPS (`scripts/enriquecer-sites.ts`). Descarta webmail, domínio compartilhado por mais de 3 empresas (em geral é o do contador) e página estacionada. A origem fica em `site_fonte`.
- **Busca no Google:** não usada. Raspagem automática viola os termos de uso e é bloqueada; a alternativa é API oficial (Google Custom Search ou Brave Search) com chave e custo por consulta.

## 4.2 Ingestão feita em 2026-10-23

- Competência **2026-10**, baixada do compartilhamento público da RFB (6,8 GB compactados).
- Filtro em streaming: estabelecimentos ATIVOS nos 27 CNAEs do catálogo, Brasil todo (3.232.070 estabelecimentos).
- Recorte carregado, **ICP enxuto**, decidido com o usuário porque o recorte inicial dava cerca de 1 milhão de empresas:
  - escritórios de investimento, gestoras e auxiliares financeiros no Brasil;
  - imobiliárias no RJ;
  - empresas-cliente no RJ de porte EPP ou médio/grande;
  - sedes no exterior (UF "EX") excluídas.
- Resultado: **86.054 empresas**, 100% com município geolocalizado (sede do município, casada pelo código SIAFI).
- Sócios (QSA) não importados.

## 4.3 Site institucional e LinkedIn

- Página inicial dos sites confirmados: título, descrição e links de LinkedIn e Instagram da empresa (`scripts/coletar-sites.ts`).
- **LinkedIn:** só o link publicado pela própria empresa no site. Raspar o LinkedIn viola os termos de uso e não é feito. Nas fichas sem link, o botão "Buscar no LinkedIn" abre a busca no navegador do executivo.

## 5. Plano de ingestão (fase 2)

1. Baixar o lote mensal (Empresas, Estabelecimentos, Simples, CNAE, Municípios). Sócios só quando houver base legal definida.
2. Carregar em tabelas de staging; filtrar `situacao_cadastral = 02 (ativa)` e o recorte de CNAEs/UFs do ICP para controlar volume.
3. Geocodificar: CNEFE por CEP, fallback centróide IBGE do município.
4. Upsert em `companies` com `source = 'receita'`, `source_ref = <competência AAAA-MM>`.
5. Recalcular scores do recorte alterado.
6. Registrar o lote em `ingestion_runs` (competência, linhas lidas, inseridas, atualizadas, rejeitadas).

O script `app/scripts/import-receita.ts` documenta o mapeamento de colunas; ver `ARQUITETURA.md`.

## Fontes consultadas
- [Repositório de dados abertos da Receita Federal (gov.br)](https://www.gov.br/receitafederal/dados)
- [Notícia sobre CNPJ alfanumérico em 2026 (Correio)](https://www.correio24horas.com.br/politica/receita-federal-fica-sem-numeros-de-zero-a-nove-para-novos-cadastros-e-prepara-mudanca-historica-no-cnpj-0626)
- [Guia comparativo de APIs de CNPJ (Direct Data, fonte comercial)](https://www.directd.com.br/guias/melhor-api-consulta-cnpj-cpf)
