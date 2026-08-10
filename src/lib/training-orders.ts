export type TrainingOrderSpec = {
  key: string;
  type: "PAY_IN" | "PAY_OUT";
  rail: "UPI" | "IMPS" | "NEFT" | "RTGS";
  amount: number;
  dayAgo?: number;
};

export const TRAINING_HISTORY_ORDERS: readonly TrainingOrderSpec[] = [
  { key: "001", type: "PAY_IN", rail: "UPI", amount: 5_000, dayAgo: 0 },
  { key: "002", type: "PAY_OUT", rail: "UPI", amount: 12_500, dayAgo: 0 },
  { key: "003", type: "PAY_IN", rail: "IMPS", amount: 48_000, dayAgo: 0 },
  { key: "004", type: "PAY_OUT", rail: "IMPS", amount: 85_000, dayAgo: 1 },
  { key: "005", type: "PAY_IN", rail: "IMPS", amount: 125_000, dayAgo: 2 },
  { key: "006", type: "PAY_OUT", rail: "NEFT", amount: 165_000, dayAgo: 3 },
  { key: "007", type: "PAY_IN", rail: "RTGS", amount: 250_000, dayAgo: 4 },
  { key: "008", type: "PAY_OUT", rail: "NEFT", amount: 285_000, dayAgo: 5 },
  { key: "009", type: "PAY_IN", rail: "RTGS", amount: 375_000, dayAgo: 6 },
  { key: "010", type: "PAY_OUT", rail: "UPI", amount: 49_000, dayAgo: 7 },
  { key: "011", type: "PAY_IN", rail: "IMPS", amount: 120_000, dayAgo: 9 },
] as const;

export const TRAINING_QUEUE_ORDERS: readonly TrainingOrderSpec[] = [
  { key: "101", type: "PAY_IN", rail: "UPI", amount: 7_500 },
  { key: "102", type: "PAY_OUT", rail: "UPI", amount: 18_000 },
  { key: "103", type: "PAY_IN", rail: "IMPS", amount: 62_500 },
  { key: "104", type: "PAY_OUT", rail: "NEFT", amount: 175_000 },
  { key: "105", type: "PAY_OUT", rail: "RTGS", amount: 250_000 },
] as const;

export function trainingOrderFitsRail(order: Pick<TrainingOrderSpec, "rail" | "amount">) {
  if (!Number.isFinite(order.amount) || order.amount <= 0) return false;
  if (order.rail === "UPI") return order.amount <= 100_000;
  if (order.rail === "IMPS") return order.amount <= 500_000;
  if (order.rail === "RTGS") return order.amount >= 200_000;
  return true;
}
