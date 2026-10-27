/** Junta classes condicionais. Módulo neutro: usado por componentes de servidor e de cliente. */
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
