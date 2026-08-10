import assert from "node:assert/strict";
import test from "node:test";
import { decryptProcessingData, encryptProcessingData, maskDestination } from "../src/lib/processing-data";
import { paymentRailSchema, processingOrderSchema } from "../src/lib/processing-schemas";

test("processing payment data is encrypted and round-trips", () => {
  process.env.PROCESSING_DATA_KEY = Buffer.alloc(32, 7).toString("base64");
  const clear = { beneficiaryName: "Test Beneficiary", upiId: "test@upi" };
  const ciphertext = encryptProcessingData(clear);
  assert.equal(ciphertext.includes(clear.beneficiaryName), false);
  assert.deepEqual(decryptProcessingData(ciphertext), clear);
});

test("payment rails require the destination that matches their type", () => {
  const invalidUpi = paymentRailSchema.safeParse({
    type: "UPI", label: "Primary", accountHolder: "Test Holder", upiId: "not-upi",
    bankName: "", accountNumber: "", ifsc: "", minTicketInr: "", maxTicketInr: "", dailyLimitInr: "",
  });
  assert.equal(invalidUpi.success, false);

  const validBank = paymentRailSchema.safeParse({
    type: "IMPS", label: "Bank rail", accountHolder: "Test Holder", upiId: "",
    bankName: "Test Bank", accountNumber: "1234567890", ifsc: "TEST0123456",
    minTicketInr: "100", maxTicketInr: "10000", dailyLimitInr: "50000",
  });
  assert.equal(validBank.success, true);
});

test("pay-in and pay-out validate different counterparty data", () => {
  const base = { externalReference: "ORDER-1", requestedRail: "UPI", amountInr: "1000", expiryMinutes: "30", payerReference: "", bankName: "", accountNumber: "", ifsc: "", companyNote: "" };
  assert.equal(processingOrderSchema.safeParse({ ...base, type: "PAY_IN", payerName: "Payer Name", beneficiaryName: "", upiId: "" }).success, true);
  assert.equal(processingOrderSchema.safeParse({ ...base, type: "PAY_OUT", payerName: "", beneficiaryName: "Beneficiary", upiId: "beneficiary@upi" }).success, true);
  assert.equal(processingOrderSchema.safeParse({ ...base, type: "PAY_OUT", payerName: "", beneficiaryName: "Beneficiary", upiId: "" }).success, false);
});

test("processing orders respect normal payment-rail amount guardrails", () => {
  const payIn = {
    externalReference: "ORDER-LIMIT",
    type: "PAY_IN",
    expiryMinutes: "30",
    payerName: "Test Payer",
    payerReference: "",
    beneficiaryName: "",
    upiId: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
    companyNote: "",
  };

  assert.equal(processingOrderSchema.safeParse({ ...payIn, requestedRail: "UPI", amountInr: "100000" }).success, true);
  assert.equal(processingOrderSchema.safeParse({ ...payIn, requestedRail: "UPI", amountInr: "100001" }).success, false);
  assert.equal(processingOrderSchema.safeParse({ ...payIn, requestedRail: "IMPS", amountInr: "500000" }).success, true);
  assert.equal(processingOrderSchema.safeParse({ ...payIn, requestedRail: "IMPS", amountInr: "500001" }).success, false);
  assert.equal(processingOrderSchema.safeParse({ ...payIn, requestedRail: "RTGS", amountInr: "199999" }).success, false);
  assert.equal(processingOrderSchema.safeParse({ ...payIn, requestedRail: "RTGS", amountInr: "200000" }).success, true);
  assert.equal(processingOrderSchema.safeParse({ ...payIn, requestedRail: "NEFT", amountInr: "750000" }).success, true);
});

test("masked destinations do not expose full bank or UPI identifiers", () => {
  assert.equal(maskDestination("123456789012"), "••••••••9012");
  assert.equal(maskDestination("merchant@upi"), "me••••••@upi");
});
