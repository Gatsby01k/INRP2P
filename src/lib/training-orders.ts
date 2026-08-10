export type TrainingOrderSpec = {
  key: string;
  type: "PAY_IN" | "PAY_OUT";
  rail: "UPI" | "IMPS" | "NEFT" | "RTGS";
  amount: number;
  dayAgo?: number;
};

export const TRAINING_HISTORY_ORDERS: readonly TrainingOrderSpec[] = [
  { key: "001", type: "PAY_IN", rail: "UPI", amount: 2_499, dayAgo: 0 },
  { key: "002", type: "PAY_OUT", rail: "UPI", amount: 7_850, dayAgo: 0 },
  { key: "003", type: "PAY_IN", rail: "UPI", amount: 18_499, dayAgo: 0 },
  { key: "004", type: "PAY_IN", rail: "IMPS", amount: 42_750, dayAgo: 0 },
  { key: "005", type: "PAY_OUT", rail: "UPI", amount: 65_000, dayAgo: 0 },
  { key: "006", type: "PAY_IN", rail: "UPI", amount: 3_200, dayAgo: 1 },
  { key: "007", type: "PAY_OUT", rail: "UPI", amount: 14_750, dayAgo: 1 },
  { key: "008", type: "PAY_IN", rail: "UPI", amount: 32_400, dayAgo: 1 },
  { key: "009", type: "PAY_OUT", rail: "IMPS", amount: 76_500, dayAgo: 1 },
  { key: "010", type: "PAY_IN", rail: "IMPS", amount: 118_250, dayAgo: 1 },
  { key: "011", type: "PAY_OUT", rail: "UPI", amount: 9_999, dayAgo: 2 },
  { key: "012", type: "PAY_IN", rail: "UPI", amount: 21_650, dayAgo: 2 },
  { key: "013", type: "PAY_OUT", rail: "IMPS", amount: 58_500, dayAgo: 2 },
  { key: "014", type: "PAY_IN", rail: "NEFT", amount: 142_000, dayAgo: 2 },
  { key: "015", type: "PAY_IN", rail: "UPI", amount: 47_500, dayAgo: 3 },
  { key: "016", type: "PAY_OUT", rail: "IMPS", amount: 88_750, dayAgo: 3 },
  { key: "017", type: "PAY_IN", rail: "RTGS", amount: 225_000, dayAgo: 3 },
  { key: "018", type: "PAY_OUT", rail: "IMPS", amount: 174_500, dayAgo: 4 },
  { key: "019", type: "PAY_IN", rail: "RTGS", amount: 240_000, dayAgo: 4 },
  { key: "020", type: "PAY_IN", rail: "UPI", amount: 27_850, dayAgo: 5 },
  { key: "021", type: "PAY_OUT", rail: "NEFT", amount: 108_000, dayAgo: 5 },
  { key: "022", type: "PAY_IN", rail: "IMPS", amount: 92_000, dayAgo: 6 },
  { key: "023", type: "PAY_OUT", rail: "RTGS", amount: 310_000, dayAgo: 6 },
  { key: "024", type: "PAY_IN", rail: "IMPS", amount: 68_500, dayAgo: 8 },
] as const;

export const TRAINING_QUEUE_ORDERS: readonly TrainingOrderSpec[] = [
  { key: "101", type: "PAY_IN", rail: "UPI", amount: 1_899 },
  { key: "102", type: "PAY_OUT", rail: "UPI", amount: 12_750 },
  { key: "103", type: "PAY_IN", rail: "UPI", amount: 47_500 },
  { key: "104", type: "PAY_OUT", rail: "IMPS", amount: 86_250 },
  { key: "105", type: "PAY_IN", rail: "NEFT", amount: 135_000 },
  { key: "106", type: "PAY_OUT", rail: "RTGS", amount: 285_000 },
] as const;

export function trainingOrderFitsRail(order: Pick<TrainingOrderSpec, "rail" | "amount">) {
  if (!Number.isFinite(order.amount) || order.amount <= 0) return false;
  if (order.rail === "UPI") return order.amount <= 100_000;
  if (order.rail === "IMPS") return order.amount <= 500_000;
  if (order.rail === "RTGS") return order.amount >= 200_000;
  return true;
}
