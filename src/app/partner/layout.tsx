import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requireVerifiedRole } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireVerifiedRole("PARTNER");
  return (
    <WorkspaceShell
      badge="Partner"
      badgeTone="emerald"
      userLine={user.email}
      nav={[
        { href: "/partner", label: "Home", exact: true },
        { href: "/partner/processing", label: "Orders" },
        { href: "/partner/capacity", label: "Availability" },
        { href: "/partner/verification", label: "Verification" },
        { href: "/partner/profile", label: "Profile" },
        { href: "/account/security", label: "Security" },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
