import { describe, expect, it } from "vitest";
import { fantasiaValida, nomeExibicao } from "@/lib/nome";

describe("nome de exibição", () => {
  const razaoSocial = "NOVA MILANO INVESTIMENTOS LTDA.";

  it("usa a razão social quando o nome fantasia é só símbolo", () => {
    for (const nomeFantasia of ["...", "****", "-", "'", "  ", "******", "1", "A."]) expect(nomeExibicao({ nomeFantasia, razaoSocial })).toBe(razaoSocial);
  });

  it("mantém nomes fantasia de verdade, inclusive curtos, com acento ou com símbolos", () => {
    for (const nomeFantasia of ["2GROW", "XP", "Ágil", "'NEST ASSET MANAGEMENT'", "3W INVESTIMENTOS - AI"]) expect(nomeExibicao({ nomeFantasia, razaoSocial })).toBe(nomeFantasia);
  });

  it("cai para a razão social sem nome fantasia", () => {
    expect(nomeExibicao({ nomeFantasia: null, razaoSocial })).toBe(razaoSocial);
    expect(fantasiaValida(undefined)).toBeNull();
  });
});

describe("qualidade do dado no score", () => {
  it("nome fantasia só de símbolo conta como faltando", async () => {
    const { qualidadeDoDado } = await import("@/lib/scoring/engine");
    const base = { razaoSocial: "NOVA MILANO INVESTIMENTOS LTDA.", cnaePrincipal: "6630-4/00", situacao: "ATIVA" } as unknown as Parameters<typeof qualidadeDoDado>[0];
    const simbolo = qualidadeDoDado({ ...base, nomeFantasia: "****" });
    const real = qualidadeDoDado({ ...base, nomeFantasia: "Nova Milano" });
    expect(simbolo.faltando).toContain("nome fantasia");
    expect(real.faltando).not.toContain("nome fantasia");
    expect(real.points).toBeGreaterThan(simbolo.points);
  });
});
