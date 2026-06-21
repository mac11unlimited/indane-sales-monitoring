export type RiskLevel = "Critical" | "High" | "Normal";

export type DailyPoint = {
  date: string;
  mt: number;
};

export type ForecastInputs = {
  asOf: string;
  daily: DailyPoint[];
  lastYearSameDateMt?: number;
  monthlyTargetDailyMt?: number;
  pendingBacklog?: number;
};

export type ExplainableForecast = {
  nextDayMt: number;
  nextSevenDaysMt: number;
  movingAverage7: number;
  movingAverage14: number;
  backlogBoostPct: number;
  explanation: string;
};

export function movingAverage(points: DailyPoint[], days: number): number {
  const values = points.slice(-days).map((p) => Number(p.mt) || 0).filter((v) => v > 0);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function classifyStockOutRisk(daysCover: number): RiskLevel {
  if (daysCover <= 1) return "Critical";
  if (daysCover <= 2) return "High";
  return "Normal";
}

export function requiredTrucks(predictedCylinders: number, capacity: number): number {
  return Math.ceil((Number(predictedCylinders) || 0) / Math.max(1, Number(capacity) || 1));
}

export function explainableForecast(input: ForecastInputs): ExplainableForecast {
  const ma7 = movingAverage(input.daily, 7);
  const ma14 = movingAverage(input.daily, 14);
  const ly = Number(input.lastYearSameDateMt) || 0;
  const target = Number(input.monthlyTargetDailyMt) || 0;
  const backlogBoostPct = Math.min(15, (Number(input.pendingBacklog) || 0) / 25000);
  const base = ma7 * 0.42 + ma14 * 0.22 + ly * 0.18 + target * 0.18;
  const fallback = target || ma7 || ma14 || ly || 1;
  const nextDayMt = Math.max(1, (base || fallback) * (1 + backlogBoostPct / 100));
  return {
    nextDayMt,
    nextSevenDaysMt: nextDayMt * 7,
    movingAverage7: ma7,
    movingAverage14: ma14,
    backlogBoostPct,
    explanation:
      `Prediction uses 7-day average ${ma7.toFixed(1)} MT, 14-day average ${ma14.toFixed(1)} MT, ` +
      `last year reference ${ly.toFixed(1)} MT, daily target ${target.toFixed(1)} MT and backlog uplift ${backlogBoostPct.toFixed(1)}%.`,
  };
}
