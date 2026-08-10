import type { Metadata } from "next";
import { FormShell } from "@/components/site/form-shell";
import { ApplyForm } from "@/components/forms/apply-form";

export const metadata: Metadata = {
  title: "Create an INR processing partner workspace",
  description:
    "Create a private INRP2P partner workspace for reviewed INR pay-in and pay-out operations. Submit a short profile, verify your email, and complete activation from the dashboard.",
  alternates: { canonical: "/apply" },
};

export default function ApplyPage() {
  return (
    <FormShell
      eyebrow="INR processing partner"
      title="Create your partner workspace."
      sub="Tell us who operates the desk and what you can process. Your workspace is created after this short application; live orders remain locked until review, reserve and payment-account activation are complete."
      facts={["One short application", "Workspace created first", "Private manual approval"]}
      wide
    >
      <ApplyForm />
    </FormShell>
  );
}
