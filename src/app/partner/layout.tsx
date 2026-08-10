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
        { href: "/partner", label: "Overview", exact: true },
        { href: "/partner/profile", label: "Profile & capacity" },
        { href: "/partner/capacity", label: "Capacity pulse" },
        { href: "/partner/offers", label: "Offers" },
        { href: "/partner/processing", label: "Processing desk" },
        { href: "/partner/network", label: "Company networks" },
        { href: "/partner/verification", label: "Trust Passport" },
        { href: "/partner/deposit", label: "USDT reserve" },
        { href: "/account/security", label: "Security" },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
