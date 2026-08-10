import crypto from "crypto";

export type ProcessingPaymentData = {
  accountHolder?: string;
  payerName?: string;
  payerReference?: string;
  beneficiaryName?: string;
  upiId?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
};

const VERSION = "v1";

function encryptionKey() {
  const configured = process.env.PROCESSING_DATA_KEY?.trim();
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length !== 32) {
      throw new Error("PROCESSING_DATA_KEY must be a base64-encoded 32-byte key.");
    }
    return decoded;
  }
  throw new Error("PROCESSING_DATA_KEY is required for processing data encryption.");
}

export function encryptProcessingData(value: ProcessingPaymentData) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptProcessingData(payload: string): ProcessingPaymentData {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported encrypted processing payload.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(clear) as ProcessingPaymentData;
}

export function maskDestination(value: string) {
  const clean = value.trim();
  if (clean.includes("@")) {
    const [handle, provider] = clean.split("@");
    const start = handle.slice(0, Math.min(2, handle.length));
    return `${start}${"•".repeat(Math.max(3, handle.length - start.length))}@${provider}`;
  }
  const compact = clean.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, compact.length - 4))}${compact.slice(-4)}`;
}

export function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}•••`)
    .join(" ");
}
