import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fmtCnae, parseEmpresa, parseEstabelecimento, splitLine } from "../../scripts/receita-layout";

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, "../fixtures/receita", f), "latin1").trim().split("\r\n");

describe("layout da Receita (amostra fictícia)", () => {
  it("separa campos com aspas e ponto e vírgula", () => {
    expect(splitLine('"a";"b;c";"d""e";""')).toEqual(["a", "b;c", 'd"e', ""]);
  });

  it("lê estabelecimento ativo com CNAEs, contato e datas", () => {
    const e = parseEstabelecimento(splitLine(fx("ESTABELE.csv")[0]))!;
    expect(e.cnpj).toBe("99000001000100");
    expect(e.situacao).toBe("ATIVA");
    expect(e.cnaePrincipal).toBe("6612-6/05");
    expect(e.cnaesSecundarios).toEqual(["6619-3/99", "7020-4/00"]);
    expect(e.dataAbertura).toBe("2015-03-10");
    expect(e.nomeFantasia).toBe("ÂNCORA TESTE INVESTIMENTOS");
    expect(e.email).toBe("contato@ancora.example");
  });

  it("reconhece estabelecimento baixado", () => {
    expect(parseEstabelecimento(splitLine(fx("ESTABELE.csv")[1]))!.situacao).toBe("BAIXADA");
  });

  it("lê empresa com capital em formato brasileiro e porte", () => {
    const [basico, emp] = parseEmpresa(splitLine(fx("EMPRECSV.csv")[3]))!;
    expect(basico).toBe("99000004");
    expect(emp.capitalSocial).toBe(2_500_000);
    expect(emp.porte).toBe("DEMAIS");
  });

  it("formata CNAE de 7 dígitos", () => {
    expect(fmtCnae("6821801")).toBe("6821-8/01");
    expect(fmtCnae("")).toBeNull();
  });
});
