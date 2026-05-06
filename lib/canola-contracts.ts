const ICE_CANOLA_MONTHS = [
  { month: 1, code: "F" },
  { month: 3, code: "H" },
  { month: 5, code: "K" },
  { month: 7, code: "N" },
  { month: 11, code: "X" },
] as const;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function getIceCanolaLastTradingDay(year: number, month: number): Date {
  const candidate = new Date(Date.UTC(year, month - 1, 14));
  while (isWeekend(candidate)) {
    candidate.setUTCDate(candidate.getUTCDate() - 1);
  }
  return candidate;
}

function twoDigitYear(year: number): string {
  return String(year).slice(-2);
}

export function getIceCanolaFrontMonthSymbol(asOf: Date = new Date()): string {
  const asOfDate = new Date(Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
  ));
  let year = asOfDate.getUTCFullYear();

  for (let attempts = 0; attempts < 3; attempts++) {
    for (const contract of ICE_CANOLA_MONTHS) {
      const lastTradingDay = getIceCanolaLastTradingDay(year, contract.month);
      if (asOfDate <= lastTradingDay) {
        return `RS${contract.code}${twoDigitYear(year)}`;
      }
    }
    year++;
  }

  throw new Error("Could not resolve ICE Canola front-month symbol");
}

export function getIceCanolaContractMonths(): readonly typeof ICE_CANOLA_MONTHS[number][] {
  return ICE_CANOLA_MONTHS;
}
