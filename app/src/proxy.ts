import { NextResponse, type NextRequest } from "next/server";

// Barreira otimista: sem cookie de sessão, nem chega a renderizar. A validação real
// (token no banco, expiração, org) acontece no servidor em requireSession/requireApiSession.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("radar_session");
  const { pathname } = req.nextUrl;
  // Acesso aberto (RADAR_ACESSO_ABERTO): sem login; a sessão é resolvida no servidor (lib/auth/session.ts).
  if (process.env.RADAR_ACESSO_ABERTO) {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (pathname === "/login") return NextResponse.next();
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|brand/|maplibre/).*)"],
};
