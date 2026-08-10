import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requireVerifiedRole } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireVerifiedRole("COMPANY");
  return (
    <WorkspaceShell
      badge="Company"
      badgeTone="sky"
      userLine={user.email}
      nav={[
        { href: "/company", label: "My requests", exact: true },
        { href: "/company/new-request", label: "New request" },
        { href: "/company/processing", label: "Merchant processing" },
        { href: "/company/network", label: "Private network" },
        { href: "/company/verification", label: "Verification" },
        { href: "/account/security", label: "Security" },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
