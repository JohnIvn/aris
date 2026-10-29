export interface PayrollConfig {
  baseHourlyRate: number;
  dtrHourlyRate: number;
  overloadRate: number;
  defaultCycleHours: number;
  allowancePerCycle: number;
  taxRatePercent: number;
  enableRankPricing: boolean;
  enableOverload: boolean;
  instructorRate: number;
  assistantProfRate: number;
  associateProfRate: number;
  professorRate: number;
  departmentHeadRate: number;
  lecturerRate: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  baseHourlyRate: 500,
  dtrHourlyRate: 250,
  overloadRate: 600,
  defaultCycleHours: 30,
  allowancePerCycle: 0,
  taxRatePercent: 0,
  enableRankPricing: true,
  enableOverload: false,
  instructorRate: 400,
  assistantProfRate: 500,
  associateProfRate: 650,
  professorRate: 800,
  departmentHeadRate: 900,
  lecturerRate: 450,
};

export function resolveFacultyRate(
  position: string | null | undefined,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG,
): number {
  if (!config.enableRankPricing) return Number(config.baseHourlyRate) || 500;
  const pos = String(position || '').toLowerCase().trim();
  if (/dept|department\s*head/i.test(pos)) return Number(config.departmentHeadRate) || 900;
  if (/assoc/i.test(pos)) return Number(config.associateProfRate) || 650;
  if (/assist/i.test(pos)) return Number(config.assistantProfRate) || 500;
  if (/prof/i.test(pos)) return Number(config.professorRate) || 800;
  if (/instructor/i.test(pos)) return Number(config.instructorRate) || 400;
  if (/lecturer|adjunct/i.test(pos)) return Number(config.lecturerRate) || 450;
  return Number(config.baseHourlyRate) || 500;
}

export function computePayrollAmount(
  type: 'AR' | 'DTR',
  hours: number,
  position: string | null | undefined,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG,
) {
  const safeHours = Math.max(0, Number(hours) || 0);
  const rate =
    type === 'DTR'
      ? Number(config.dtrHourlyRate) || 250
      : resolveFacultyRate(position, config);

  const cycleHours = Math.max(1, Number(config.defaultCycleHours) || 30);
  const overloadRate = Number(config.overloadRate) || Math.round(rate * 1.25);
  const allowance = Math.max(0, Number(config.allowancePerCycle) || 0);
  const taxPct = Math.max(0, Math.min(100, Number(config.taxRatePercent) || 0));

  let regularHours = safeHours;
  let overloadHours = 0;

  if (config.enableOverload && safeHours > cycleHours) {
    regularHours = cycleHours;
    overloadHours = safeHours - cycleHours;
  }

  const regularPay = Math.round(regularHours * rate);
  const overloadPay = Math.round(overloadHours * overloadRate);
  const grossPay = regularPay + overloadPay + allowance;
  const taxAmount = Math.round((grossPay * taxPct) / 100);
  const netAmount = Math.max(0, grossPay - taxAmount);

  let formula = `${safeHours.toFixed(1)} hrs × ₱${rate.toLocaleString()}/hr`;
  if (overloadHours > 0) {
    formula = `(${regularHours} hrs × ₱${rate}) + (${overloadHours.toFixed(1)} ovl hrs × ₱${overloadRate})`;
  }
  if (allowance > 0) {
    formula += ` + ₱${allowance.toLocaleString()} allow`;
  }
  if (taxPct > 0) {
    formula += ` - ${taxPct}% tax (₱${taxAmount.toLocaleString()})`;
  }
  formula += ` = ₱${netAmount.toLocaleString()}`;

  return {
    rate,
    regularHours,
    overloadHours,
    regularPay,
    overloadPay,
    allowance,
    taxPct,
    taxAmount,
    grossPay,
    netAmount,
    formula,
  };
}

