export const PARTNER_PROGRAM_LEVELS = [
  {
    code: "STARTER",
    name: "Starter",
    marker: "emerald",
    monthlyBaseUsdt: 400,
    activationReserveUsdt: 400,
    commissionRate: 1,
    volumeRange: "₹10–20 lakh",
    commissionPotential: "₹10,000–₹20,000",
  },
  {
    code: "VERIFIED",
    name: "Verified",
    marker: "blue",
    monthlyBaseUsdt: 700,
    activationReserveUsdt: 700,
    commissionRate: 1.25,
    volumeRange: "₹25–50 lakh",
    commissionPotential: "₹31,250–₹62,500",
  },
  {
    code: "PRO",
    name: "Pro",
    marker: "violet",
    monthlyBaseUsdt: 1_000,
    activationReserveUsdt: 1_000,
    commissionRate: 1.5,
    volumeRange: "₹50 lakh–₹1 crore",
    commissionPotential: "₹75,000–₹1.5 lakh",
  },
  {
    code: "PRIME",
    name: "Prime",
    marker: "slate",
    monthlyBaseUsdt: 1_500,
    activationReserveUsdt: 1_500,
    commissionRate: 2,
    volumeRange: "₹1–3 crore",
    commissionPotential: "₹2–6 lakh",
  },
] as const;

export type PartnerProgramCode = (typeof PARTNER_PROGRAM_LEVELS)[number]["code"];
export type PartnerProgramLevel = (typeof PARTNER_PROGRAM_LEVELS)[number];

export function partnerProgramLevel(value?: string | null): PartnerProgramLevel {
  return PARTNER_PROGRAM_LEVELS.find((level) => level.code === value?.toUpperCase())
    ?? PARTNER_PROGRAM_LEVELS[0];
}

export function partnerOrderCommission(amountInr: number, level: PartnerProgramLevel) {
  return Math.round(((amountInr * level.commissionRate) / 100) * 100) / 100;
}
