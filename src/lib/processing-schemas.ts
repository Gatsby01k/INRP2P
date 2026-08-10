import { z } from "zod";

const money = z.coerce.number().finite().positive().max(100_000_000);
const optionalMoney = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().finite().positive().max(100_000_000).optional(),
);

export const paymentRailSchema = z.object({
  type: z.enum(["UPI", "IMPS", "NEFT", "RTGS", "BANK_TRANSFER"]),
  label: z.string().trim().min(2).max(80),
  accountHolder: z.string().trim().min(2).max(120),
  upiId: z.string().trim().max(120).optional().default(""),
  bankName: z.string().trim().max(120).optional().default(""),
  accountNumber: z.string().trim().max(40).optional().default(""),
  ifsc: z.string().trim().max(20).optional().default(""),
  minTicketInr: optionalMoney,
  maxTicketInr: optionalMoney,
  dailyLimitInr: optionalMoney,
}).superRefine((data, ctx) => {
  if (data.type === "UPI" && !/^[\w.+-]{2,}@[\w.-]{2,}$/.test(data.upiId)) {
    ctx.addIssue({ code: "custom", path: ["upiId"], message: "Enter a valid UPI ID." });
  }
  if (data.type !== "UPI" && (!data.accountNumber || !/^[A-Za-z0-9-]{5,40}$/.test(data.accountNumber))) {
    ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Enter the bank account number." });
  }
  if (data.type !== "UPI" && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(data.ifsc)) {
    ctx.addIssue({ code: "custom", path: ["ifsc"], message: "Enter a valid IFSC." });
  }
  if (data.minTicketInr && data.maxTicketInr && data.minTicketInr > data.maxTicketInr) {
    ctx.addIssue({ code: "custom", path: ["maxTicketInr"], message: "Maximum ticket must be above minimum ticket." });
  }
});

export const processingOrderSchema = z.object({
  externalReference: z.string().trim().min(2).max(100),
  type: z.enum(["PAY_IN", "PAY_OUT"]),
  requestedRail: z.enum(["UPI", "IMPS", "NEFT", "RTGS", "BANK_TRANSFER"]),
  amountInr: money,
  expiryMinutes: z.coerce.number().int().min(10).max(180).default(30),
  payerName: z.string().trim().max(120).optional().default(""),
  payerReference: z.string().trim().max(120).optional().default(""),
  beneficiaryName: z.string().trim().max(120).optional().default(""),
  upiId: z.string().trim().max(120).optional().default(""),
  bankName: z.string().trim().max(120).optional().default(""),
  accountNumber: z.string().trim().max(40).optional().default(""),
  ifsc: z.string().trim().max(20).optional().default(""),
  companyNote: z.string().trim().max(500).optional().default(""),
}).superRefine((data, ctx) => {
  if (data.type === "PAY_IN" && data.payerName.length < 2) {
    ctx.addIssue({ code: "custom", path: ["payerName"], message: "Payer name is required for pay-in reconciliation." });
  }
  if (data.type === "PAY_OUT" && data.beneficiaryName.length < 2) {
    ctx.addIssue({ code: "custom", path: ["beneficiaryName"], message: "Beneficiary name is required." });
  }
  if (data.type === "PAY_OUT" && data.requestedRail === "UPI" && !/^[\w.+-]{2,}@[\w.-]{2,}$/.test(data.upiId)) {
    ctx.addIssue({ code: "custom", path: ["upiId"], message: "A valid beneficiary UPI ID is required." });
  }
  if (data.type === "PAY_OUT" && data.requestedRail !== "UPI") {
    if (!/^[A-Za-z0-9-]{5,40}$/.test(data.accountNumber)) {
      ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Beneficiary account number is required." });
    }
    if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(data.ifsc)) {
      ctx.addIssue({ code: "custom", path: ["ifsc"], message: "A valid beneficiary IFSC is required." });
    }
  }
});

export const processingAccountSchema = z.object({
  partnerId: z.string().cuid(),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  approvedLimitInr: z.coerce.number().finite().min(0).max(1_000_000_000),
  payInFeeBps: z.coerce.number().int().min(0).max(5000),
  payOutFeeBps: z.coerce.number().int().min(0).max(5000),
});
