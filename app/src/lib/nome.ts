/** Módulo neutro: usado por servidor e cliente. */

// Nome fantasia só vale se tiver ao menos duas letras; "...", "****", "-" e afins são lixo de cadastro da Receita.
const DUAS_LETRAS = /\p{L}.*\p{L}/u;

export const fantasiaValida = (fantasia: string | null | undefined): string | null =>
  fantasia && DUAS_LETRAS.test(fantasia) ? fantasia : null;

/** Nome para mostrar: o fantasia quando é um nome de verdade, senão a razão social. */
export const nomeExibicao = (c: { nomeFantasia: string | null; razaoSocial: string }) => fantasiaValida(c.nomeFantasia) ?? c.razaoSocial;
