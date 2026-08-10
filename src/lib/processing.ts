import type { ProcessingOrderStatus, ProcessingOrderType } from "@prisma/client";

export function processingTypeLabel(type: ProcessingOrderType | string) {
  return type === "PAY_IN" ? "Pay-in" : "Pay-out";
}

export function paymentRailLabel(rail: string) {
  return rail === "BANK_TRANSFER" ? "Bank transfer" : rail;
}

export function inr(value: { toString(): string } | string | number) {
  const number = Number(typeof value === "object" ? value.toString() : value);
  return `₹${number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function bpsLabel(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

export function isFinalProcessingStatus(status: ProcessingOrderStatus | string) {
  return ["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"].includes(status);
}

export function processingSteps(type: ProcessingOrderType) {
  return type === "PAY_IN"
    ? ["AVAILABLE", "ASSIGNED", "PAYMENT_MARKED", "COMPLETED"] as const
    : ["AVAILABLE", "ASSIGNED", "PAYOUT_SENT", "COMPLETED"] as const;
}

export function processingStatusHint(type: ProcessingOrderType, status: ProcessingOrderStatus) {
  const hints: Partial<Record<ProcessingOrderStatus, string>> = {
    AVAILABLE: "Waiting for an eligible trader to take the order.",
    ASSIGNED: type === "PAY_IN" ? "Payment destination issued; waiting for payer confirmation." : "Trader has the beneficiary details and must send the payout.",
    PAYMENT_MARKED: "Payer marked the transfer sent; trader must verify receipt in their bank or UPI app.",
    PAYOUT_SENT: "Trader recorded the payout reference; merchant must confirm delivery.",
    COMPLETED: "Both required sides confirmed this order.",
    DISPUTED: "Operator review is open and insurance exposure remains locked.",
    FAILED: "Order closed as failed after review.",
    EXPIRED: "Order expired before assignment.",
    CANCELLED: "Merchant cancelled this order before assignment.",
  };
  return hints[status] ?? "";
}
