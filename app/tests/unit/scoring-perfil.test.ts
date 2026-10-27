import { describe, expect, it } from "vitest";
import { CNAES } from "@/lib/cnaes";
import { perfilDoScore, scoreCompany, type ScorableCompany } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHTS, mergeWeights } from "@/lib/scoring/weights";

// O Radar reaproveita o score de empresas com o mesmo perfil (perfilDoScore). Se o motor passar a ler
// um campo que a chave não cobre, empresas diferentes dividiriam o mesmo score: este teste pega isso.

let semente = 42;
const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const um = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

function empresa(): ScorableCompany {
  return {
    razaoSocial: "EMPRESA TESTE LTDA",
    nomeFantasia: um([null, "", "****", "...", "Nova Gestora", "XP", "A."]),
    situacao: um(["ATIVA", "ATIVA", "ATIVA", "BAIXADA", "ativa", "INAPTA"]),
    cnaePrincipal: um([null, "9999-9/99", ...CNAES.map((c) => c.code)]),
    porte: um([null, "ME", "EPP", "DEMAIS", "NI"]),
    capitalSocial: um([null, 0, -10, 1, 49_999, 50_000, 499_999, 500_000, 4_999_999, 5_000_000, 80_000_000]),
    dataAbertura: um([null, "data-invalida", "2026-10-01", "2025-12-01", "2024-01-15", "2023-10-28", "2019-05-05", "2016-10-27", "2005-01-01"]),
    telefone: um([null, "(21) 0000-0000"]),
    email: um([null, "contato@empresa.example"]),
    site: um([null, "https://empresa.example"]),
    funcionariosFaixa: um([null, "1-4", "5-9", "10-49", "50-99", "100+"]),
    geoPrecision: um([null, "municipio", "cep", "endereco"]),
    source: um(["receita", "demo", "enriquecimento"]),
    uf: "RJ",
    municipio: "Rio de Janeiro",
  } as unknown as ScorableCompany;
}

const numeros = (c: ScorableCompany, w: ReturnType<typeof mergeWeights>, now: Date) => {
  const s = scoreCompany(c, w, now);
  return (["geral", "saude", "seguro", "credito", "parceria"] as const).map((k) => `${k}:${s[k].value}:${s[k].confidence}`).join(" ");
};

describe("perfil do score", () => {
  for (const [nome, pesos] of [
    ["pesos padrão", DEFAULT_WEIGHTS],
    ["pesos calibrados", mergeWeights({ saude: { porte: 5, setor: 1 }, parceria: { digital: 4 }, geral: { qualidade: 3 } })],
  ] as const) {
    it(`empresas com o mesmo perfil têm o mesmo score (${nome})`, () => {
      const w = mergeWeights(pesos);
      const now = new Date("2026-10-27T12:00:00Z");
      const porPerfil = new Map<string, string>();
      let comparadas = 0;
      for (let i = 0; i < 20000; i++) {
        const c = empresa();
        const p = perfilDoScore(c, now);
        const n = numeros(c, w, now);
        const antes = porPerfil.get(p);
        if (antes === undefined) porPerfil.set(p, n);
        else {
          comparadas++;
          expect(n, `perfil ${p}`).toBe(antes);
        }
      }
      expect(comparadas).toBeGreaterThan(1000);
    });
  }
});
