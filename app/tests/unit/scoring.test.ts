import { describe, expect, it } from "vitest";
import { anosDeAtividade, scoreCompany, solucoesRecomendadas, type ScorableCompany } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHTS, mergeWeights, weightsSchema, type Weights } from "@/lib/scoring/weights";

const NOW = new Date("2026-10-23T12:00:00Z");
const W = DEFAULT_WEIGHTS as unknown as Weights;

const base: ScorableCompany = {
  situacao: "ATIVA",
  cnaePrincipal: "6612-6/05", // agente de investimentos
  porte: "EPP",
  capitalSocial: 400_000,
  dataAbertura: "2014-03-01",
  telefone: "(21) 0123-4567",
  email: "contato@x.example",
  site: "https://x.example",
  nomeFantasia: "X Investimentos",
  funcionariosFaixa: "10-49",
  geoPrecision: "cep",
  source: "demo",
};

describe("motor de score", () => {
  it("escritório de investimento completo tem parceria alta e confiança alta", () => {
    const s = scoreCompany(base, W, NOW);
    expect(s.parceria.value).toBeGreaterThanOrEqual(90);
    expect(s.parceria.confidence).toBe("alta");
    expect(solucoesRecomendadas(s)[0]).toBe("parceria");
  });

  it("todo critério expõe peso, evidência e origem", () => {
    const s = scoreCompany(base, W, NOW);
    for (const k of ["geral", "saude", "seguro", "credito", "parceria"] as const) {
      for (const c of s[k].criteria) {
        expect(c.weight).toBeGreaterThanOrEqual(0);
        expect(c.points).toBeGreaterThanOrEqual(0);
        expect(c.points).toBeLessThanOrEqual(1);
        expect(c.evidence.length).toBeGreaterThan(3);
        expect(c.origin).toBeTruthy();
      }
    }
  });

  it("funcionários é sempre marcado como estimativa", () => {
    const s = scoreCompany(base, W, NOW);
    const f = s.saude.criteria.find((c) => c.key === "funcionarios")!;
    expect(f.isEstimate).toBe(true);
  });

  it("aderência de setor é premissa, não fato", () => {
    const s = scoreCompany({ ...base, cnaePrincipal: "4120-4/00" }, W, NOW);
    expect(s.seguro.criteria.find((c) => c.key === "setor")!.origin).toBe("premissa");
  });

  it("empresa não ativa zera todos os scores com nota explicativa", () => {
    const s = scoreCompany({ ...base, situacao: "BAIXADA" }, W, NOW);
    for (const k of ["geral", "saude", "seguro", "credito", "parceria"] as const) {
      expect(s[k].value).toBe(0);
      expect(s[k].note).toMatch(/BAIXADA/);
    }
  });

  it("sem perfil de distribuição, parceria fica limitada a 20", () => {
    const s = scoreCompany({ ...base, cnaePrincipal: "4120-4/00" }, W, NOW);
    expect(s.parceria.value).toBeLessThanOrEqual(20);
  });

  it("dado ausente pontua zero e derruba a confiança", () => {
    const vazio = { ...base, porte: null, capitalSocial: null, dataAbertura: null, telefone: null, email: null, funcionariosFaixa: null };
    const s = scoreCompany(vazio, W, NOW);
    expect(s.saude.confidence).toBe("baixa");
    expect(s.saude.criteria.filter((c) => c.origin === "ausente").length).toBeGreaterThanOrEqual(3);
    expect(s.saude.value).toBeLessThan(scoreCompany(base, W, NOW).saude.value);
  });

  it("crédito explica que não mede necessidade financeira", () => {
    expect(scoreCompany(base, W, NOW).credito.note).toMatch(/Não indica necessidade/);
  });

  it("score é média ponderada dos critérios", () => {
    const r = scoreCompany(base, W, NOW).seguro;
    const total = r.criteria.reduce((a, c) => a + c.weight, 0);
    const expected = Math.round((100 * r.criteria.reduce((a, c) => a + c.weight * c.points, 0)) / total);
    expect(r.value).toBe(expected);
  });

  it("mudar peso muda o score", () => {
    const pesos = mergeWeights({ ...DEFAULT_WEIGHTS, saude: { funcionarios: 0, porte: 0, setor: 0, tempo: 0, contato: 100 } });
    expect(scoreCompany(base, pesos, NOW).saude.value).toBe(100);
  });

  it("calcula anos de atividade", () => {
    expect(Math.floor(anosDeAtividade("2016-10-23", NOW)!)).toBe(10);
    expect(anosDeAtividade(null, NOW)).toBeNull();
  });
});

describe("validação de pesos", () => {
  it("rejeita grupo com todos os pesos zerados", () => {
    const r = weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, geral: { aderencia: 0, qualidade: 0, porte: 0 } });
    expect(r.success).toBe(false);
  });
  it("rejeita peso fora de 0..100 e cai no padrão no merge", () => {
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, geral: { aderencia: 500, qualidade: 1, porte: 1 } }).success).toBe(false);
    expect(mergeWeights({ lixo: true })).toEqual(DEFAULT_WEIGHTS);
  });
});
