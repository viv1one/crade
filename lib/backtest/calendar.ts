// Pure calendar-date math shared by the calendar-effect strategies
// (turn-of-month, payday, January barometer, option-expiry week). No
// trading-calendar awareness — weekends/market holidays aren't modeled,
// so a "last N days of month" window may cover 1-2 fewer real trading
// days than intended when month-end lands on or near a weekend. Bars
// only exist for actual trading days anyway, so callers apply these
// per-bar and the gap self-corrects in practice; it's a stated
// simplification, not a hidden one.

function utcDate(time: number): Date {
  return new Date(time * 1000);
}

export function calendarYear(time: number): number {
  return utcDate(time).getUTCFullYear();
}

// 0-11 (January = 0), matching Date's own convention.
export function calendarMonth(time: number): number {
  return utcDate(time).getUTCMonth();
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

// The classic turn-of-month window (Ariel 1987): the last `daysBeforeEnd`
// calendar days of a month through the first `daysAfterStart` calendar
// days of the next.
export function isTurnOfMonth(time: number, daysBeforeEnd = 1, daysAfterStart = 3): boolean {
  const d = utcDate(time);
  const day = d.getUTCDate();
  const dim = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  return day > dim - daysBeforeEnd || day <= daysAfterStart;
}

// Indian salary-credit convention: last day and first `windowDays` of the
// month. Mechanically similar to turn-of-month but a narrower window tied
// specifically to payday buying pressure rather than institutional
// month-end rebalancing flows — kept as a separate function so the two
// strategies can use different window sizes.
export function isPaydayWindow(time: number, windowDays = 1): boolean {
  const d = utcDate(time);
  const day = d.getUTCDate();
  const dim = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  return day > dim - windowDays || day <= windowDays;
}

// NSE's monthly F&O expiry has conventionally fallen on the last Thursday
// of the month. This is calendar-date math, not NSE's actual published
// expiry calendar — it won't reflect ad-hoc holiday shifts.
export function daysToMonthlyExpiry(time: number): number {
  const d = utcDate(time);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  let expiryDay = daysInMonth(year, month);
  while (new Date(Date.UTC(year, month, expiryDay)).getUTCDay() !== 4) expiryDay--; // 4 = Thursday
  return expiryDay - d.getUTCDate();
}

export function isExpiryWeek(time: number, daysBefore = 3): boolean {
  const remaining = daysToMonthlyExpiry(time);
  return remaining >= 0 && remaining <= daysBefore;
}
