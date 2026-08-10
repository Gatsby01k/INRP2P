import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/processing/order-detail";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Processing order control" };
export const dynamic = "force-dynamic";

export default async function AdminProcessingOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const query = await searchParams;
  const order = await db.processingOrder.findUnique({
    where: { id },
    include: { company: true, partner: true, rail: true, settlement: true, events: true },
  });
  if (!order) notFound();
  return <OrderDetailView order={order} viewer="admin" notice={query.notice} error={query.error} />;
}
