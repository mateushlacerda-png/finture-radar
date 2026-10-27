import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Finture Radar", template: "%s · Finture Radar" },
  description: "Inteligência comercial B2B da Finture: empresas priorizadas por aderência, com score explicável e CRM.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
