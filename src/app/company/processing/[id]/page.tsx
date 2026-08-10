import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderDetailView } from "@/components/processing/order-detail";
import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Merchant order" };
export const dynamic = "force-dynamic";

export default async function CompanyProcessingOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireVerifiedRole("COMPANY");
  if (!user.company) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const order = await db.processingOrder.findFirst({
    where: { id, companyId: user.company.id },
    include: { company: true, partner: true, rail: true, settlement: true, events: true },
  });
  if (!order) notFound();
  return <OrderDetailView order={order} viewer="company" notice={query.notice} error={query.error} />;
}
