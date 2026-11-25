/**
 * Piecewise-linear time scale that gives recent centuries more room than deep history,
 * so 5,000 years fit on one axis without crushing the modern era.
 */
export const TIME_BREAKS = [-3500, -1000, 0, 1000, 1500, 1800, 1950, 2030];
const STOPS = [0, 0.12, 0.24, 0.4, 0.55, 0.7, 0.84, 1];

export function timeToUnit(year: number): number {
  if (year <= TIME_BREAKS[0]) return 0;
  for (let i = 1; i < TIME_BREAKS.length; i++) {
    if (year <= TIME_BREAKS[i]) {
      const t = (year - TIME_BREAKS[i - 1]) / (TIME_BREAKS[i] - TIME_BREAKS[i - 1]);
      return STOPS[i - 1] + t * (STOPS[i] - STOPS[i - 1]);
    }
  }
  return 1;
}

export function unitToTime(unit: number): number {
  if (unit <= 0) return TIME_BREAKS[0];
  for (let i = 1; i < STOPS.length; i++) {
    if (unit <= STOPS[i]) {
      const t = (unit - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1]);
      return Math.round(TIME_BREAKS[i - 1] + t * (TIME_BREAKS[i] - TIME_BREAKS[i - 1]));
    }
  }
  return TIME_BREAKS[TIME_BREAKS.length - 1];
}

export const AXIS_TICKS = [-3000, -1000, 0, 500, 1000, 1500, 1800, 1900, 1950, 2000];
