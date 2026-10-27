import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/auth/session";
import { getDataMode } from "@/lib/queries/data-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [s, mode, jar] = await Promise.all([requireSession(), getDataMode(), cookies()]);
  return (
    <Shell user={{ name: s.name, role: s.role, orgName: s.orgName }} dataNote={{ kind: mode.kind, competencia: mode.competencia }} collapsed={jar.get("radar_sidebar")?.value === "1"}>
      {children}
    </Shell>
  );
}
