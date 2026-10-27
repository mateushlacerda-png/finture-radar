// Teste manual da geração por IA, fora do Next (sem banco): npx tsx scripts/testar-overview.ts (precisa de scripts/noop.cjs com "module.exports = {};")
// O módulo real importa "server-only"; aqui o require é desviado para um vazio.
import Module from "node:module";
const orig = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename = function (req: unknown, ...rest: unknown[]) {
  if (req === "server-only") return require.resolve("./noop.cjs");
  return orig.call(this, req, ...rest);
};

async function main() {
  const { gerarOverviewIA } = await import("../src/lib/ai/overview");
  const t = Date.now();
  const r = await gerarOverviewIA({
    razaoSocial: "AGUILA CAPITAL ADMINISTRACAO E GESTAO DE CAPITAIS LTDA",
    nomeFantasia: "AGUILA CAPITAL",
    cnaePrincipal: "6630-4/00",
    cnaesSecundarios: [],
    naturezaJuridica: "2062",
    porte: "DEMAIS",
    capitalSocial: 5902447,
    dataAbertura: "2003-10-01",
    bairro: "SAO CONRADO",
    municipio: "Rio de Janeiro",
    uf: "RJ",
    siteDescricao: null,
    sourceRef: "RFB dados abertos CNPJ 2026-10",
    isDemo: false,
    site: "https://www.aguila.com.br",
    telefone: null,
    email: null,
    situacao: "ATIVA",
  });
  console.log(JSON.stringify(r, null, 2));
  console.log(`${((Date.now() - t) / 1000).toFixed(1)} s`);
}
main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
