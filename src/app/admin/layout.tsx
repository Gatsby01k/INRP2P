import type { Metadata } from "next";
import { AiCopilot } from "@/components/workspace/ai-copilot";
import { CommandPalette } from "@/components/workspace/command-palette";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("ADMIN");
  return (
    <>
      <CommandPalette />
      <AiCopilot />
      <WorkspaceShell
        badge="Operations"
        badgeTone="gold"
        userLine={user.email}
        showBuildTag
        nav={[
          { href: "/admin", label: "Dashboard", exact: true },
          { href: "/admin/analytics", label: "Analytics" },
          { href: "/admin/requests", label: "Requests" },
          { href: "/admin/partners", label: "Partners" },
          { href: "/admin/deposits", label: "Deposits" },
          { href: "/admin/processing", label: "Processing" },
          { href: "/admin/matches", label: "Matches" },
          { href: "/admin/revenue", label: "Revenue" },
          { href: "/admin/risk", label: "Risk radar" },
          { href: "/admin/reviews", label: "Verification" },
          { href: "/admin/incidents", label: "Incidents" },
          { href: "/admin/audit", label: "Audit log" },
          { href: "/admin/errors", label: "Errors" },
          { href: "/admin/security", label: "Security" },
        ]}
      >
        {children}
      </WorkspaceShell>
    </>
  );
}
