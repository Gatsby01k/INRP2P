const INDIA_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type MoneyValue = { toString(): string } | string | number;

export type CompletedPerformanceOrder = {
  type: string;
  amountInr: MoneyValue;
  partnerFeeInr: MoneyValue;
  completedAt: Date | null;
};

export type PerformancePeriod = {
  orders: number;
  volumeInr: number;
  feeInr: number;
};

export type PartnerPerformanceSummary = {
  today: PerformancePeriod;
  sevenDays: PerformancePeriod;
  month: PerformancePeriod;
  averageTicketInr: number;
  payIn: PerformancePeriod;
  payOut: PerformancePeriod;
};

export type IndiaPerformancePeriods = {
  now: Date;
  todayStart: Date;
  sevenDaysStart: Date;
  monthStart: Date;
  historyStart: Date;
};

function startOfIndiaCalendarDate(now: Date, dayOffset = 0) {
  const indiaNow = new Date(now.getTime() + INDIA_OFFSET_MS + dayOffset * DAY_MS);
  return new Date(
    Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), indiaNow.getUTCDate()) -
      INDIA_OFFSET_MS,
  );
}

export function indiaPerformancePeriods(now = new Date()): IndiaPerformancePeriods {
  const indiaNow = new Date(now.getTime() + INDIA_OFFSET_MS);
  const todayStart = startOfIndiaCalendarDate(now);
  const sevenDaysStart = startOfIndiaCalendarDate(now, -6);
  const monthStart = new Date(
    Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), 1) - INDIA_OFFSET_MS,
  );

  return {
    now,
    todayStart,
    sevenDaysStart,
    monthStart,
    historyStart: new Date(Math.min(sevenDaysStart.getTime(), monthStart.getTime())),
  };
}

function emptyPeriod(): PerformancePeriod {
  return { orders: 0, volumeInr: 0, feeInr: 0 };
}

function addOrder(period: PerformancePeriod, order: CompletedPerformanceOrder) {
  period.orders += 1;
  period.volumeInr += Number(order.amountInr.toString());
  period.feeInr += Number(order.partnerFeeInr.toString());
}

export function summarizePartnerPerformance(
  orders: CompletedPerformanceOrder[],
  periods: IndiaPerformancePeriods,
): PartnerPerformanceSummary {
  const today = emptyPeriod();
  const sevenDays = emptyPeriod();
  const month = emptyPeriod();
  const payIn = emptyPeriod();
  const payOut = emptyPeriod();

  for (const order of orders) {
    if (!order.completedAt) continue;
    const completedAt = order.completedAt.getTime();
    if (completedAt > periods.now.getTime()) continue;

    if (completedAt >= periods.todayStart.getTime()) addOrder(today, order);
    if (completedAt >= periods.sevenDaysStart.getTime()) addOrder(sevenDays, order);
    if (completedAt >= periods.monthStart.getTime()) {
      addOrder(month, order);
      if (order.type === "PAY_IN") addOrder(payIn, order);
      if (order.type === "PAY_OUT") addOrder(payOut, order);
    }
  }

  return {
    today,
    sevenDays,
    month,
    averageTicketInr: month.orders ? month.volumeInr / month.orders : 0,
    payIn,
    payOut,
  };
}

export function indiaMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function indiaDateTime(date: Date) {
  return `${new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date)} IST`;
}
