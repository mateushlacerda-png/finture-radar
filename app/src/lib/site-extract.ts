// Extração do HTML público do site da própria empresa. Sem dependências: regex simples, suficiente
// para título, descrição e links de redes no rodapé. Perfil pessoal de LinkedIn (/in/) é ignorado de
// propósito: é dado pessoal de sócio ou funcionário (docs/LGPD.md).

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»", ordm: "º", ordf: "ª", copy: "©", reg: "®",
};
// Acentos do português: &atilde; &Ccedil; etc.
for (const [base, marcas] of Object.entries({ a: "acute grave circ tilde uml", e: "acute grave circ uml", i: "acute grave circ uml", o: "acute grave circ tilde uml", u: "acute grave circ uml", c: "cedil", n: "tilde" })) {
  const comb: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈", cedil: "̧" };
  for (const m of marcas.split(" ")) {
    ENTIDADES[base + m] = (base + comb[m]).normalize("NFC");
    ENTIDADES[base.toUpperCase() + m] = (base.toUpperCase() + comb[m]).normalize("NFC");
  }
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m;
  });
}

const limpa = (s: string, max: number) => {
  const t = decodeEntities(s).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
};

function meta(html: string, nome: string): string | null {
  // Aceita name= ou property=, e content antes ou depois do atributo de nome.
  const re = new RegExp(
    `<meta[^>]+(?:name|property)\\s*=\\s*["']${nome}["'][^>]*content\\s*=\\s*["']([^"']*)["']|<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${nome}["']`,
    "i",
  );
  const m = html.match(re);
  const v = m?.[1] ?? m?.[2];
  return v && v.trim() ? v : null;
}

export function extractMeta(html: string): { titulo: string | null; descricao: string | null } {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const d = meta(html, "description") ?? meta(html, "og:description");
  return { titulo: t && t.trim() ? limpa(t, 160) : null, descricao: d ? limpa(d, 400) : null };
}

export function extractSocial(html: string): { linkedin: string | null; instagram: string | null } {
  const semScript = html.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ");
  const hrefs = [...semScript.matchAll(/href\s*=\s*["']([^"'#\s]+)["']/gi)].map((m) => decodeEntities(m[1]));
  let linkedin: string | null = null;
  let instagram: string | null = null;
  for (const h of hrefs) {
    if (!linkedin) {
      const m = h.match(/^(?:https?:)?\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|school|showcase)\/([A-Za-z0-9._%-]+)/i);
      if (m) linkedin = `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}`;
    }
    if (!instagram) {
      const m = h.match(/^(?:https?:)?\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?(?:[?#].*)?$/i);
      if (m && !/^(p|reel|reels|explore|accounts|share|stories|tv|direct)$/i.test(m[1])) instagram = `https://www.instagram.com/${m[1]}`;
    }
    if (linkedin && instagram) break;
  }
  return { linkedin, instagram };
}

/** Texto visível aproximado, para dar contexto à IA. */
export function htmlToText(html: string, max = 8000): string {
  const t = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(t)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 2)
    .join("\n")
    .slice(0, max);
}

/** Busca uma página do próprio site da empresa com limites de tempo e tamanho. */
export async function fetchPage(url: string, timeoutMs = 10000): Promise<{ url: string; html: string } | null> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "FintureRadar/1.0 (leitura de site institucional)", Accept: "text/html" },
    });
    if (r.status >= 400 || !(r.headers.get("content-type") ?? "").includes("text/html")) return null;
    return { url: r.url, html: (await r.text()).slice(0, 400_000) };
  } catch {
    return null;
  }
}
