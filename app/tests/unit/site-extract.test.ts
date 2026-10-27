import { describe, expect, it } from "vitest";
import { decodeEntities, extractMeta, extractSocial, htmlToText } from "@/lib/site-extract";

const HTML = `<!doctype html><html><head>
<title>Aguila Capital &#8211; Gest&atilde;o de recursos</title>
<meta content="Gestora independente no Rio de Janeiro desde 2003." name="description">
<meta property="og:description" content="ignorada quando há description">
<script>var x = "<a href='https://linkedin.com/company/fake'>"</script>
</head><body>
<nav>Menu</nav><h1>Quem somos</h1><p>Gestão de patrimônio para famílias.</p>
<footer>
<a href="https://www.linkedin.com/in/joao-socio">Sócio</a>
<a href="https://br.linkedin.com/company/aguila-capital/about/">LinkedIn</a>
<a href="https://www.instagram.com/p/abc123/">post</a>
<a href="https://instagram.com/aguilacapital/">Instagram</a>
</footer></body></html>`;

describe("extração do site", () => {
  it("lê título e descrição com entidades", () => {
    expect(extractMeta(HTML)).toEqual({ titulo: "Aguila Capital – Gestão de recursos", descricao: "Gestora independente no Rio de Janeiro desde 2003." });
  });

  it("usa og:description quando não há description", () => {
    expect(extractMeta('<meta property="og:description" content="Sobre nós">').descricao).toBe("Sobre nós");
  });

  it("acha LinkedIn da empresa e ignora perfil pessoal", () => {
    const s = extractSocial(HTML);
    expect(s.linkedin).toBe("https://www.linkedin.com/company/aguila-capital");
    expect(s.instagram).toBe("https://www.instagram.com/aguilacapital");
  });

  it("sem rede social devolve null", () => {
    expect(extractSocial("<a href='/contato'>x</a>")).toEqual({ linkedin: null, instagram: null });
  });

  it("converte HTML em texto sem scripts", () => {
    const t = htmlToText(HTML);
    expect(t).toContain("Gestão de patrimônio para famílias.");
    expect(t).not.toContain("var x");
  });

  it("decodifica entidades numéricas e nomeadas", () => {
    expect(decodeEntities("S&atilde;o &amp; &#233; &#x41; &Ccedil;")).toBe("São & é A Ç");
  });
});
