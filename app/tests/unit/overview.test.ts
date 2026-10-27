import { describe, expect, it } from "vitest";
import { factualOverview, type OverviewInput } from "@/lib/overview";

const base: OverviewInput = {
  razaoSocial: "AGUILA CAPITAL ADMINISTRACAO E GESTAO DE CAPITAIS LTDA",
  nomeFantasia: "AGUILA CAPITAL",
  cnaePrincipal: "6630-4/00",
  cnaesSecundarios: ["6619-3/99"],
  naturezaJuridica: "2062",
  porte: "DEMAIS",
  capitalSocial: 5_902_447,
  dataAbertura: "2003-10-01",
  bairro: "SAO CONRADO",
  municipio: "Rio de Janeiro",
  uf: "RJ",
  siteDescricao: "Gestora independente desde 2003.",
  sourceRef: "RFB dados abertos CNPJ 2026-10",
  isDemo: false,
};

describe("overview factual", () => {
  const o = factualOverview(base, new Date("2026-10-23T12:00:00Z"));

  it("descreve atividade, local, tempo, porte, capital e natureza", () => {
    const t = o.paragrafos.join(" ");
    expect(t).toContain("Aguila Capital atua como gestora ou consultoria CVM (CNAE 6630-4/00");
    expect(t).toContain("Sao Conrado, Rio de Janeiro/RJ");
    expect(t).toContain("há 23 anos (aberta em 2003)");
    expect(t).toContain("é de médio ou grande porte no cadastro");
    expect(t).toMatch(/R\$\s?5\.902\.447/);
    expect(t).toContain("natureza jurídica de sociedade empresária limitada");
  });

  it("cita a descrição do site entre aspas e credita as fontes", () => {
    expect(o.paragrafos.at(-1)).toBe("No próprio site, a empresa se apresenta assim: “Gestora independente desde 2003.”");
    expect(o.fontes).toEqual(["RFB dados abertos CNPJ 2026-10", "Descrição publicada no site da empresa"]);
  });

  it("sem dado opcional, não inventa frase", () => {
    const m = factualOverview({ ...base, porte: "NI", capitalSocial: null, dataAbertura: null, naturezaJuridica: null, cnaesSecundarios: [], siteDescricao: null });
    expect(m.paragrafos).toHaveLength(1);
    expect(m.fontes).toEqual(["RFB dados abertos CNPJ 2026-10"]);
  });

  it("não usa travessão", () => {
    expect(o.paragrafos.join(" ")).not.toContain("—");
  });
});
