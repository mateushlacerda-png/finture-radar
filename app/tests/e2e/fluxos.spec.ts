import { expect, test, type Page } from "@playwright/test";

// Fluxos do PRD, seção 6 (critérios de aceite). Rodam contra a base de demonstração.

const SENHA = "radar-demo-2026";

async function login(page: Page, email: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const panel = (page: Page) => page.getByRole("complementary", { name: "Ficha da empresa" });
const results = (page: Page) => page.locator("main ul li > button");
const firstResult = (page: Page) => results(page).first();
const total = async (page: Page) =>
  Number((await page.getByText(/empresas · ordenadas/).locator("strong").innerText()).replace(/\D/g, ""));

test.describe.configure({ mode: "serial" });

test("rota protegida redireciona ao login e senha errada é recusada", async ({ page }) => {
  await page.goto("/crm");
  await expect(page).toHaveURL(/\/login\?next=%2Fcrm/);
  await page.getByLabel("E-mail").fill("gestor@finture.demo");
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
  const api = await page.request.get("/api/companies");
  expect(api.status()).toBe(401);
});

test("radar filtra, guarda filtros na URL e abre a ficha com score explicado", async ({ page }) => {
  await login(page, "gestor@finture.demo", "/radar");
  // Sem filtros, o Radar pergunta primeiro quem a pessoa procura.
  await expect(page.getByRole("heading", { name: "Quem você quer encontrar hoje?" })).toBeVisible();
  await page.getByRole("button", { name: /Ver toda a base/ }).click();
  await expect(page.getByText(/ordenadas por score Geral/)).toBeVisible();
  await expect(firstResult(page)).toBeVisible();
  const totalTodos = await total(page);

  await page.getByRole("radio", { name: "Parceiros" }).click();
  await page.getByRole("button", { name: /Filtros/ }).click();
  await page.getByLabel("Estado").selectOption("RJ");
  await page.getByLabel(/Score Parceria mínimo/).fill("60");
  await expect(page).toHaveURL(/uf=RJ/);
  await expect(page).toHaveURL(/tipo=parceiro/);
  await expect(page).toHaveURL(/scoreMin=60/);
  await expect(page.getByText(/ordenadas por score Parceria/)).toBeVisible();
  await expect(firstResult(page)).toContainText("/RJ");
  const totalFiltrado = await total(page);
  expect(totalFiltrado).toBeGreaterThan(0);
  expect(totalFiltrado).toBeLessThan(totalTodos);

  await firstResult(page).click();
  const p = panel(page);
  await expect(p.getByText("Score e justificativa")).toBeVisible();
  for (const nome of ["Geral", "Saúde", "Seguro", "Crédito", "Parceria"]) await expect(p.getByRole("tab", { name: new RegExp(nome) })).toBeVisible();
  await expect(p.getByText("Dado simulado").first()).toBeVisible();
  await p.getByRole("tab", { name: /Parceria/ }).click();
  await expect(p.getByText("Perfil de parceiro")).toBeVisible();
  await expect(p.getByText("Premissa").first()).toBeVisible();
  await p.getByRole("tab", { name: /Saúde/ }).click();
  await expect(p.getByText("estimativa").first()).toBeVisible();
});

test("salvar em lista nova e ver em Listas", async ({ page }) => {
  await login(page, "juliana@finture.demo", "/radar?uf=MG&tipo=parceiro");
  await firstResult(page).click();
  const nome = await panel(page).getByRole("heading", { level: 2 }).innerText();
  await panel(page).getByRole("button", { name: "Lista" }).click();
  await page.getByLabel("Lista", { exact: true }).selectOption("__new");
  const lista = `E2E MG ${Date.now()}`;
  await page.getByLabel("Nome da nova lista").fill(lista);
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Empresa salva na lista.")).toBeVisible();
  await page.goto("/listas");
  await page.getByRole("link", { name: new RegExp(lista) }).click();
  await expect(page.getByRole("heading", { name: lista })).toBeVisible();
  await expect(page.getByRole("link", { name: nome })).toBeVisible();
});

test("adicionar ao CRM, mover no kanban, registrar nota e tarefa", async ({ page }) => {
  await login(page, "gestor@finture.demo", "/radar?tipo=parceiro&status=novo&uf=SC");
  await firstResult(page).click();
  const nome = await panel(page).getByRole("heading", { level: 2 }).innerText();
  const id = await panel(page).getAttribute("data-company-id");
  await panel(page).getByRole("button", { name: "CRM" }).click();
  await page.getByLabel("Próxima ação").fill("Apresentar o modelo white-label");
  await page.getByRole("button", { name: "Criar oportunidade" }).click();
  await expect(page.getByText(`${nome} entrou no CRM.`)).toBeVisible();

  await page.goto("/crm?funil=parceiro");
  const cardIn = (stage: string) => page.locator(`[data-stage="${stage}"] [data-company-id="${id}"]`);
  await expect(cardIn("lead_identificado")).toBeVisible();
  await cardIn("lead_identificado").getByRole("combobox").selectOption("primeiro_contato");
  await expect(cardIn("primeiro_contato")).toBeVisible();
  await page.reload();
  await expect(cardIn("primeiro_contato")).toBeVisible();

  await cardIn("primeiro_contato").getByRole("link", { name: nome }).click();
  await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
  await expect(page.getByText("Movida para Primeiro contato")).toBeVisible();
  await page.getByRole("radio", { name: "Ligação" }).click();
  await page.getByLabel("Conteúdo do registro").fill("Falei com o sócio, pediu material");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Falei com o sócio, pediu material")).toBeVisible();
  await page.getByLabel("Título da tarefa").fill("Enviar apresentação");
  await page.getByLabel("Data da tarefa").fill("2026-11-05");
  await page.getByRole("button", { name: "Adicionar tarefa" }).click();
  await expect(page.getByLabel("Concluir: Enviar apresentação")).toBeVisible();
  await page.getByLabel("Concluir: Enviar apresentação").check();
  await expect(page.getByLabel("Concluir: Enviar apresentação")).toBeChecked();
});

test("descartar tira do radar e o filtro de descartadas traz de volta", async ({ page }) => {
  await login(page, "gestor@finture.demo", "/radar?uf=AC&status=novo");
  await firstResult(page).click();
  const nome = await panel(page).getByRole("heading", { level: 2 }).innerText();
  const id = await panel(page).getAttribute("data-company-id");
  await panel(page).getByRole("button", { name: "Descartar" }).click();
  await page.getByLabel("Motivo").selectOption("Fora do perfil (ICP)");
  await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("Lead descartado.")).toBeVisible();
  await page.goto(`/radar?uf=AC&q=${encodeURIComponent(nome)}`);
  await expect(page.getByText(/empresas · ordenadas/)).toBeVisible();
  const ids = async () => (await (await page.request.get(`/api/companies?uf=AC&q=${encodeURIComponent(nome)}`)).json()).rows.map((r: { id: number }) => String(r.id));
  expect(await ids()).not.toContain(id);
  const desc = (await (await page.request.get(`/api/companies?uf=AC&status=descartado&q=${encodeURIComponent(nome)}`)).json()).rows.map((r: { id: number }) => String(r.id));
  expect(desc).toContain(id);
  await page.goto(`/radar?uf=AC&status=descartado&q=${encodeURIComponent(nome)}`);
  await expect(results(page).filter({ hasText: nome }).first()).toBeVisible();
});

test("dashboard mostra KPIs e o período muda os números", async ({ page }) => {
  await login(page, "gestor@finture.demo", "/");
  await expect(page.getByRole("heading", { name: "Visão comercial" })).toBeVisible();
  for (const k of ["Empresas mapeadas", "Leads qualificados", "Em prospecção", "Oportunidades abertas"]) await expect(page.getByText(k).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversão por etapa" })).toBeVisible();
  const kpi = page.locator("p.eyebrow", { hasText: "Leads qualificados" }).locator("xpath=following-sibling::p[1]");
  const v90 = Number((await kpi.innerText()).replace(/\D/g, ""));
  await page.getByRole("link", { name: "12 meses" }).click();
  await expect(page.getByText("criados em 12 meses")).toBeVisible();
  const v365 = Number((await kpi.innerText()).replace(/\D/g, ""));
  expect(v365).toBeGreaterThan(v90);
});

test("calibração: executivo não edita; admin altera peso e o score muda", async ({ page }) => {
  await login(page, "juliana@finture.demo", "/configuracoes");
  await expect(page.locator("#w-saude-contato")).toBeDisabled();
  await page.context().clearCookies();

  await login(page, "admin@finture.demo", "/radar?uf=SP&tipo=cliente");
  await firstResult(page).click();
  const tab = () => panel(page).getByRole("tab", { name: /Saúde/ });
  const antes = await tab().innerText();

  await page.goto("/configuracoes");
  for (const c of ["funcionarios", "porte", "setor", "tempo"]) await page.locator(`#w-saude-${c}`).fill("0");
  await page.getByRole("button", { name: /Salvar como versão/ }).click();
  await expect(page.getByText(/Pesos salvos \(versão/)).toBeVisible();

  await page.goto("/radar?uf=SP&tipo=cliente");
  await firstResult(page).click();
  await expect(tab()).not.toHaveText(antes);

  // devolve os pesos padrão para não contaminar o ambiente
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Voltar ao padrão" }).click();
  await page.getByRole("button", { name: /Salvar como versão/ }).click();
  await expect(page.getByText(/Pesos salvos \(versão/)).toBeVisible();
});

test("exportação CSV respeita os filtros e marca dado simulado", async ({ page }) => {
  await login(page, "gestor@finture.demo", "/radar");
  const r = await page.request.get("/api/companies/export?uf=RJ&tipo=parceiro");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("text/csv");
  const linhas = (await r.text()).trim().split("\r\n");
  expect(linhas[0]).toContain("CNPJ;Nome;Razão social;UF");
  expect(linhas.length).toBeGreaterThan(1);
  for (const l of linhas.slice(1, 20)) {
    expect(l).toContain(";RJ;");
    expect(l.endsWith("SIM")).toBe(true);
  }
});

test("isolamento multi-tenant: outra organização não vê listas nem CRM", async ({ page }) => {
  await login(page, "gestor@finture.demo", "/listas");
  const href = await page.getByRole("link", { name: "Ver no mapa" }).first().getAttribute("href");
  const listaA = new URL(href!, "http://x").searchParams.get("lista")!;
  const totalA = (await (await page.request.get(`/api/companies?lista=${listaA}&status=todos`)).json()).total;
  expect(totalA).toBeGreaterThan(0);
  await page.context().clearCookies();

  await login(page, "outra@org-b.demo", "/crm");
  await expect(page.getByRole("heading", { name: "Parceiros de distribuição" })).toBeVisible();
  await expect(page.locator("[data-card]")).toHaveCount(0);
  const totalB = (await (await page.request.get(`/api/companies?lista=${listaA}&status=todos`)).json()).total;
  expect(totalB).toBe(0);
  await page.goto("/listas");
  await expect(page.getByText("Nenhuma lista ainda")).toBeVisible();
});

test("mobile: abas lista/mapa, sem rolagem horizontal e ficha em tela cheia", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, "gestor@finture.demo", "/radar");
  await page.getByRole("button", { name: /Parceiros/ }).click();
  await expect(page.getByRole("tab", { name: "Lista" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Filtros/ })).toBeVisible();
  await expect(firstResult(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await firstResult(page).click();
  await expect(panel(page)).toBeVisible();
  await ctx.close();
});
