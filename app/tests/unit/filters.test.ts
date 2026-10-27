import { describe, expect, it } from "vitest";
import { countActive, parseFilters, scoreKeyOf, serializeFilters } from "@/lib/filters";
import { describeQuery } from "@/lib/describe-filters";
import { formatActivityBody } from "@/lib/domain";

describe("filtros", () => {
  it("ida e volta pela URL preserva os filtros", () => {
    const q = "uf=RJ,SP&porte=EPP,DEMAIS&scoreMin=70&tipo=parceiro&contato=1&municipio=Niter%C3%B3i";
    const f = parseFilters(new URLSearchParams(q));
    expect(f.uf).toEqual(["RJ", "SP"]);
    expect(f.porte).toEqual(["EPP", "DEMAIS"]);
    expect(f.scoreMin).toBe(70);
    expect(parseFilters(new URLSearchParams(serializeFilters(f)))).toEqual(f);
  });

  it("descarta valores inválidos em vez de quebrar", () => {
    const f = parseFilters(new URLSearchParams("uf=XX,RJ&scoreMin=999&tipo=hacker&cnae=1'or'1&lista=nao-uuid"));
    expect(f.uf).toEqual(["RJ"]);
    expect(f.scoreMin).toBe(100);
    expect(f.tipo).toBeUndefined();
    expect(f.cnae).toBeUndefined();
    expect(f.lista).toBeUndefined();
  });

  it("score de ordenação segue a solução ou o tipo", () => {
    expect(scoreKeyOf(parseFilters({}))).toBe("geral");
    expect(scoreKeyOf(parseFilters({ tipo: "parceiro" }))).toBe("parceria");
    expect(scoreKeyOf(parseFilters({ solucao: "saude" }))).toBe("saude");
  });

  it("conta filtros ativos e descreve a pesquisa", () => {
    const f = parseFilters({ uf: "RJ", scoreMin: "60" });
    expect(countActive(f)).toBe(2);
    expect(describeQuery("regiao=sudeste&tipo=parceiro&scoreMin=70")).toBe("Parceiros · score 70+ · Sudeste");
  });

  it("formata atividade de etapa", () => {
    expect(formatActivityBody("etapa", "Etapa: perdido. Motivo: sem retorno")).toBe("Movida para Perdido. Motivo: sem retorno");
    expect(formatActivityBody("nota", "texto")).toBe("texto");
  });
});
