import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requireVerifiedRole } from "@/lib/auth";
import { isTrainingAccountEmail } from "@/lib/training";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireVerifiedRole("PARTNER");
  const training = isTrainingAccountEmail(user.email);
  return (
    <WorkspaceShell
      badge="Partner"
      badgeTone="emerald"
      userLine={training ? "Training account" : user.email}
      environmentBanner={training ? {
        label: "Training Mode",
        body: "Simulated identities, orders, reserve and commissions. No real customer data, funds or external transfers.",
      } : undefined}
      nav={[
        { href: "/partner", label: "Home", exact: true },
        { href: "/partner/processing", label: "Orders" },
        { href: "/partner/deposit", label: "Activate / Reserve" },
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
