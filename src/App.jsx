import { useState, useMemo, useEffect, useCallback } from "react";

// ============================================================
// IEQ BRAND SYSTEM
// ============================================================
const IEQ = {
  navy: "#0F1D4A",
  navyLight: "#1A2D5E",
  navyMid: "#2A3F72",
  navyFade: "#3D5289",
  gold: "#B8945F",
  goldLight: "#D4B17A",
  white: "#FFFFFF",
  offWhite: "#F8F7F4",
  cream: "#F2F0EB",
  warmGray: "#E8E5DE",
  textDark: "#1A1A2E",
  textMid: "#5A5A6E",
  textLight: "#8A8A9A",
  border: "#E0DDD6",
  borderLight: "#EDEBE6",
  success: "#2D7A4F",
  successBg: "#EDF7F1",
  danger: "#9B3B3B",
  dangerBg: "#FDF0F0",
  warning: "#B8860B",
  warningBg: "#FFF8EB",
  infoBg: "#EEF2F9",
  scenario: "#5B7BA5",
};

// ============================================================
// DATA: IRS Uniform Lifetime Table (age → divisor)
// ============================================================
const RMD_TABLE = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
  100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9,
  109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7,
  118: 2.5, 119: 2.3, 120: 2.0,
};
const RMD_START_AGE = 73;

// ============================================================
// 2025 Federal tax brackets (simplified)
// ============================================================
const TAX_BRACKETS = {
  single: [
    { min: 0, max: 11925, rate: 10 },
    { min: 11925, max: 48475, rate: 12 },
    { min: 48475, max: 103350, rate: 22 },
    { min: 103350, max: 197300, rate: 24 },
    { min: 197300, max: 250525, rate: 32 },
    { min: 250525, max: 626350, rate: 35 },
    { min: 626350, max: Infinity, rate: 37 },
  ],
  married: [
    { min: 0, max: 23850, rate: 10 },
    { min: 23850, max: 96950, rate: 12 },
    { min: 96950, max: 206700, rate: 22 },
    { min: 206700, max: 394600, rate: 24 },
    { min: 394600, max: 501050, rate: 32 },
    { min: 501050, max: 751600, rate: 35 },
    { min: 751600, max: Infinity, rate: 37 },
  ],
};

function getMarginalBracket(income, status) {
  const brackets = TAX_BRACKETS[status] || TAX_BRACKETS.married;
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (income > brackets[i].min) return brackets[i].rate;
  }
  return 10;
}

function calcFederalTax(income, status) {
  const brackets = TAX_BRACKETS[status] || TAX_BRACKETS.married;
  let tax = 0;
  let remaining = Math.max(0, income);
  for (const b of brackets) {
    const taxable = Math.min(remaining, b.max - b.min);
    tax += taxable * (b.rate / 100);
    remaining -= taxable;
    if (remaining <= 0) break;
  }
  return tax;
}

// ============================================================
// DEFAULT STATE
// ============================================================
const defaultProfile = {
  age: 70,
  planToAge: 95,

  monthlySalary: 8000,
  retirementAge: 75,
  annualRaises: 2.0,
  savingsRatePercent: 15,

  socialSecurity: 3200,
  ssStartAge: 70,
  pension: 0,
  annuityIncome: 0,
  rentalIncome: 0,
  otherIncome: 0,

  liquidSavings: 250000,
  preTaxAccounts: 600000,
  taxableAccounts: 200000,
  expectedReturn: 5.0,
  inflationRate: 3.0,

  filingStatus: "married",
  effectiveTaxRate: 18,

  useHealthcareInflation: true,
  healthcareInflationRate: 5.5,

  housing: 2200,
  insurance: 600,
  utilities: 350,
  healthcare: 800,
  debtPayments: 0,
  taxes: 500,

  groceries: 600,
  dining: 300,
  transportation: 400,
  entertainment: 200,
  travel: 500,
  giftsCharity: 300,
  personalCare: 150,
  miscellaneous: 200,

  plannedLargeExpenses: 0,
  largeExpenseYear: 0,

  liquidityThreshold: 150000,
  annualCapitalCalls: 25000,
  annualDistributions: 10000,
  liquidityReserveMonths: 12,

  homePurchaseAmount: 0,
  homePurchaseAge: 75,

  scenarioEnabled: false,
  scenarioType: "retireLater",
  scenarioRetireAge: 77,
  scenarioCutAmount: 300,
  scenarioSSAge: 70,
  scenarioSavingsRate: 25,
  scenarioCapitalCallAmount: 150000,
  scenarioCapitalCallAge: 74,
  scenarioRecurringExpense: 500,
  scenarioRecurringExpenseStartAge: 74,
  scenarioIncomeDropPct: 20,
};

// ============================================================
// FORMATTERS
// ============================================================
const fmt = (n) => {
  if (n == null || isNaN(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n < 0 ? "-" : "") + "$" + (abs / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n < 0 ? "-" : "") + "$" + (abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1) + "K";
  return (n < 0 ? "-$" : "$") + Math.round(abs).toLocaleString();
};

const fmtFull = (n) => {
  if (n == null || isNaN(n)) return "$0";
  return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString();
};

// ============================================================
// PROJECTION ENGINE
// ============================================================
function runProjection(p, overrides = {}) {
  const cfg = { ...p, ...overrides };
  const age = cfg.age || 70;
  const retireAge = cfg.retirementAge || 75;
  const planTo = cfg.planToAge || 95;
  const yearsLeft = Math.max(0, planTo - age);
  const inflRate = (cfg.inflationRate || 3) / 100;
  const realReturn = ((cfg.expectedReturn || 0) - (cfg.inflationRate || 0)) / 100;
  const hcInflRate = cfg.useHealthcareInflation ? (cfg.healthcareInflationRate || 5.5) / 100 : inflRate;
  const savingsRate = (cfg.savingsRatePercent || 0) / 100;
  const monthlySalary = cfg.monthlySalary || 0;
  const retirementMonthly = (cfg.pension || 0) + (cfg.annuityIncome || 0) + (cfg.rentalIncome || 0) + (cfg.otherIncome || 0);

  const fixedNonHC = (cfg.housing || 0) + (cfg.insurance || 0) + (cfg.utilities || 0) + (cfg.debtPayments || 0) + (cfg.taxes || 0);
  const variableMonthly = (cfg.groceries || 0) + (cfg.dining || 0) + (cfg.transportation || 0) + (cfg.entertainment || 0) + (cfg.travel || 0) + (cfg.giftsCharity || 0) + (cfg.personalCare || 0) + (cfg.miscellaneous || 0);
  const hcMonthly = cfg.healthcare || 0;
  const nonHCMonthly = fixedNonHC + variableMonthly;
  const fixedMonthly = fixedNonHC + hcMonthly;
  const totalMonthlyBase = nonHCMonthly + hcMonthly;

  const effectiveRate = (cfg.effectiveTaxRate || 18) / 100;
  const projection = [];
  let preTax = cfg.preTaxAccounts || 0;
  let taxable = (cfg.liquidSavings || 0) + (cfg.taxableAccounts || 0);

  const reserveTargetStart = totalMonthlyBase * (cfg.liquidityReserveMonths || 12);
  const annualCapitalCalls = cfg.annualCapitalCalls || 0;
  const annualDistributions = cfg.annualDistributions || 0;

  for (let y = 0; y <= yearsLeft; y++) {
    const thisAge = age + y;
    const inflMult = Math.pow(1 + inflRate, y);
    const hcInflMult = Math.pow(1 + hcInflRate, y);

    let adjNonHC = nonHCMonthly * 12 * inflMult;
    let adjHC = hcMonthly * 12 * hcInflMult;

    if (cfg.scenarioRecurringExpense > 0 && thisAge >= (cfg.scenarioRecurringExpenseStartAge || age + 1)) {
      adjNonHC += cfg.scenarioRecurringExpense * 12 * inflMult;
    }

    const adjExpenses = adjNonHC + adjHC;
    const working = thisAge < retireAge;

    let salaryThisYear = working
      ? monthlySalary * 12 * Math.pow(1 + (cfg.annualRaises || 0) / 100, y)
      : 0;

    if (cfg.scenarioIncomeDropPct > 0 && working) {
      salaryThisYear *= Math.max(0, 1 - (cfg.scenarioIncomeDropPct || 0) / 100);
    }

    const ssThisYear = thisAge >= (cfg.ssStartAge || 70) ? (cfg.socialSecurity || 0) * 12 : 0;
    const retIncomeThisYear = retirementMonthly * 12;

    const divisor = RMD_TABLE[thisAge];
    const rmdRequired = (thisAge >= RMD_START_AGE && divisor && preTax > 0) ? preTax / divisor : 0;

    const distributionThisYear = annualDistributions;
    const totalGrossIncome = salaryThisYear + ssThisYear + retIncomeThisYear + rmdRequired + distributionThisYear;

    const estTax = totalGrossIncome * effectiveRate;
    const totalNetIncome = totalGrossIncome - estTax;

    const marginalBracket = getMarginalBracket(totalGrossIncome, cfg.filingStatus || "married");
    const federalTaxEstimate = calcFederalTax(totalGrossIncome, cfg.filingStatus || "married");

    let capitalCallThisYear = annualCapitalCalls;
    if (cfg.scenarioCapitalCallAmount > 0 && thisAge === (cfg.scenarioCapitalCallAge || age + 1)) {
      capitalCallThisYear += cfg.scenarioCapitalCallAmount;
    }

    if (y > 0) {
      preTax = preTax * (1 + realReturn);
      taxable = taxable * (1 + realReturn);

      if (rmdRequired > 0) {
        preTax -= rmdRequired;
      }

      if (working && salaryThisYear > 0) {
        const saved = salaryThisYear * savingsRate;
        preTax += saved * 0.7;
        taxable += saved * 0.3;
      }

      const netCashFlow = totalNetIncome - adjExpenses - capitalCallThisYear;
      taxable += netCashFlow;

      if ((cfg.homePurchaseAmount || 0) > 0 && thisAge === (cfg.homePurchaseAge || age + 1)) {
        taxable -= cfg.homePurchaseAmount;
      }

      if ((cfg.plannedLargeExpenses || 0) > 0 && thisAge === age + (cfg.largeExpenseYear || 0)) {
        taxable -= cfg.plannedLargeExpenses;
      }

      if (taxable < 0) {
        preTax += taxable;
        taxable = 0;
      }
    }

    const totalWealth = preTax + taxable;
    const reserveTarget = totalMonthlyBase * (cfg.liquidityReserveMonths || 12) * inflMult;
    const liquidAboveReserve = taxable - reserveTarget;
    const annualBurn = Math.max(adjExpenses - totalNetIncome, 0);
    const runwayMonths = totalMonthlyBase > 0 ? taxable / totalMonthlyBase : 999;
    const stressRunwayMonths = totalMonthlyBase > 0 ? Math.max(0, taxable - capitalCallThisYear) / totalMonthlyBase : 999;

    projection.push({
      age: thisAge,
      year: y,
      wealth: Math.round(totalWealth),
      preTax: Math.round(preTax),
      taxable: Math.round(taxable),
      annualExpenses: Math.round(adjExpenses),
      annualIncome: Math.round(totalGrossIncome),
      annualNetIncome: Math.round(totalNetIncome),
      rmd: Math.round(rmdRequired),
      capitalCalls: Math.round(capitalCallThisYear),
      distributions: Math.round(distributionThisYear),
      reserveTarget: Math.round(reserveTarget),
      liquidAboveReserve: Math.round(liquidAboveReserve),
      runwayMonths: Math.round(runwayMonths * 10) / 10,
      stressRunwayMonths: Math.round(stressRunwayMonths * 10) / 10,
      annualBurn: Math.round(annualBurn),
      marginalBracket,
      federalTaxEstimate: Math.round(federalTaxEstimate),
      phase: working ? "working" : "retired",
    });
  }

  const depletionAge = projection.find(d => d.wealth <= 0)?.age || null;
  const fundedYears = depletionAge ? depletionAge - age : yearsLeft;
  const fundedPct = yearsLeft > 0 ? Math.min(100, (fundedYears / yearsLeft) * 100) : 100;
  const wealthAtEnd = projection[projection.length - 1]?.wealth || 0;
  const wealthAtRetirement = projection.find(d => d.age === retireAge)?.wealth || (preTax + taxable);

  const retireYear = projection.find(d => d.age === retireAge) || projection[projection.length - 1];
  const withdrawBase = wealthAtRetirement > 0 ? wealthAtRetirement : 1;
  const withdrawalRate = withdrawBase > 0
    ? ((Math.max(0, retireYear?.annualExpenses - retireYear?.annualNetIncome) || 0) / withdrawBase) * 100
    : 0;

  const isWorking = age < retireAge;
  const ssActive = age >= (cfg.ssStartAge || 70);
  const currentMonthlyGross = (isWorking ? monthlySalary : 0) + (ssActive ? (cfg.socialSecurity || 0) : 0) + retirementMonthly;
  const currentMonthlyNet = currentMonthlyGross * (1 - effectiveRate);
  const monthlyGap = currentMonthlyNet - totalMonthlyBase;

  const currentLiquid = (cfg.liquidSavings || 0) + (cfg.taxableAccounts || 0);
  const totalAssets = (cfg.preTaxAccounts || 0) + currentLiquid;
  const liquidityRatio = totalAssets > 0 ? currentLiquid / totalAssets : 0;
  const cushionMonths = totalMonthlyBase > 0 ? currentLiquid / totalMonthlyBase : 999;
  const reserveCoverage = reserveTargetStart > 0 ? currentLiquid / reserveTargetStart : 999;
  const unfundedReserve = annualCapitalCalls * 2;
  const postCallLiquidity = currentLiquid - annualCapitalCalls;
  const stressRunwayNow = totalMonthlyBase > 0 ? postCallLiquidity / totalMonthlyBase : 999;

  const liquidBreachAge = projection.find(d => d.taxable < (cfg.liquidityThreshold || 0))?.age || null;
  const liquidRecoveryAge = liquidBreachAge
    ? projection.find(d => d.age > liquidBreachAge && d.taxable >= (cfg.liquidityThreshold || 0))?.age || null
    : null;

  const minimumLiquidBalance = Math.min(...projection.map(d => d.taxable));
  const minimumWealth = Math.min(...projection.map(d => d.wealth));

  return {
    projection,
    depletionAge,
    fundedYears,
    fundedPct,
    wealthAtEnd,
    wealthAtRetirement,
    withdrawalRate,
    fixedMonthly,
    variableMonthly,
    totalMonthlyBase,
    monthlyGap,
    currentMonthlyGross,
    currentMonthlyNet,
    cushionMonths,
    totalAssets,
    preTaxStart: cfg.preTaxAccounts || 0,
    isWorking,
    savedFromSalary: isWorking ? monthlySalary * savingsRate : 0,
    currentLiquid,
    liquidityRatio,
    reserveTargetStart,
    reserveCoverage,
    annualCapitalCalls,
    annualDistributions,
    unfundedReserve,
    postCallLiquidity,
    stressRunwayNow,
    liquidBreachAge,
    liquidRecoveryAge,
    minimumLiquidBalance,
    minimumWealth,
  };
}

// ============================================================
// UI PRIMITIVES
// ============================================================
function IEQLogo() {
  return (
    <div style={{ width: 46, height: 46, background: IEQ.navy, borderRadius: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `1px solid ${IEQ.gold}40` }}>
      <div style={{ color: IEQ.white, fontFamily: "Georgia, serif", fontSize: 15, letterSpacing: 2 }}>IEQ</div>
      <div style={{ color: IEQ.goldLight, fontSize: 6, letterSpacing: 2.5, marginTop: 1 }}>CAPITAL</div>
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: IEQ.white, border: `1px solid ${IEQ.borderLight}`, borderRadius: 4, padding: 20, boxShadow: "0 1px 3px rgba(15,29,74,0.03)", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, subtitle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 26, margin: 0, color: IEQ.navy, fontFamily: "Georgia, serif", fontWeight: 400 }}>{children}</h2>
      {subtitle && <div style={{ fontSize: 13, color: IEQ.textLight, marginTop: 6 }}>{subtitle}</div>}
      <div style={{ width: 46, height: 2, background: IEQ.gold, marginTop: 12 }} />
    </div>
  );
}

function Badge({ children, color = IEQ.navyMid }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 2, fontSize: 11, fontWeight: 600, background: `${color}12`, color, border: `1px solid ${color}22`, letterSpacing: 0.4 }}>
      {children}
    </span>
  );
}

function StatusBadge({ status, label }) {
  const c = {
    good: { bg: IEQ.successBg, text: IEQ.success, icon: "✓" },
    warning: { bg: IEQ.warningBg, text: IEQ.warning, icon: "⚠" },
    danger: { bg: IEQ.dangerBg, text: IEQ.danger, icon: "✕" },
  }[status] || { bg: IEQ.successBg, text: IEQ.success, icon: "✓" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, background: c.bg, color: c.text, fontSize: 12, fontWeight: 700 }}>
      {c.icon} {label}
    </span>
  );
}

function PhasePill({ isWorking }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 20, background: isWorking ? `${IEQ.navy}12` : `${IEQ.gold}18`, color: isWorking ? IEQ.navy : IEQ.gold, fontSize: 12, fontWeight: 700 }}>
      {isWorking ? "Working" : "Retired"}
    </span>
  );
}

function NumberInput({ label, value, onChange, prefix = "$", min = 0, max, hint }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--c-label)", fontWeight: 500, marginBottom: 4 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--c-hint)", marginLeft: 6, fontSize: 11.5 }}>{hint}</span>}
      </label>
      <div style={{ display: "flex", alignItems: "center", background: "var(--c-input-bg)", borderRadius: 2, border: focused ? "1px solid var(--c-accent)" : "1px solid var(--c-border)", padding: "0 12px" }}>
        {prefix && <span style={{ color: "var(--c-hint)", fontWeight: 600, fontSize: 16, marginRight: 4 }}>{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={focused ? raw : Number(value).toLocaleString()}
          onFocus={() => {
            setFocused(true);
            setRaw(String(value));
          }}
          onBlur={() => {
            setFocused(false);
            const n = parseFloat(raw.replace(/,/g, ""));
            if (!isNaN(n)) onChange(Math.max(min, max != null ? Math.min(n, max) : n));
          }}
          onChange={e => setRaw(e.target.value)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16, fontWeight: 600, color: "var(--c-text)", padding: "11px 0", fontFamily: "Georgia, serif" }}
        />
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, hint, placeholder = "" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--c-label)", fontWeight: 500, marginBottom: 4 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--c-hint)", marginLeft: 6, fontSize: 11.5 }}>{hint}</span>}
      </label>
      <div style={{ display: "flex", alignItems: "center", background: "var(--c-input-bg)", borderRadius: 2, border: "1px solid var(--c-border)", padding: "0 12px" }}>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, fontWeight: 500, color: "var(--c-text)", padding: "11px 0" }}
        />
      </div>
    </div>
  );
}

function PercentInput({ label, value, onChange, hint }) {
  return <NumberInput label={label} value={value} onChange={onChange} prefix="%" min={0} max={100} hint={hint} />;
}

function Toggle({ label, value, onChange, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "8px 0" }}>
      <button onClick={() => onChange(!value)} style={{ width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", background: value ? "var(--c-accent)" : "var(--c-border)" }}>
        <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, left: value ? 25 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--c-label)" }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: "var(--c-hint)" }}>{hint}</div>}
      </div>
    </div>
  );
}

function SelectInput({ label, value, onChange, options, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--c-label)", fontWeight: 500, marginBottom: 4 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--c-hint)", marginLeft: 6, fontSize: 11.5 }}>{hint}</span>}
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: "9px 18px",
              borderRadius: 2,
              border: "1px solid",
              borderColor: value === o.value ? "var(--c-accent)" : "var(--c-border)",
              background: value === o.value ? "var(--c-accent-light)" : "var(--c-input-bg)",
              color: value === o.value ? "var(--c-accent)" : "var(--c-text)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "Georgia, serif",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 18, borderRadius: 4, background: "var(--c-card)", border: "1px solid var(--c-border)", overflow: "hidden", boxShadow: "0 1px 3px rgba(15,29,74,0.03)" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", width: "100%", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", gap: 10 }}>
        <span style={{ fontSize: 16, color: IEQ.navy }}>{icon}</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 16, fontWeight: 700, color: "var(--c-text)", fontFamily: "Georgia, serif" }}>
          {title}
          {badge && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 2, background: "var(--c-accent-light)", color: "var(--c-accent)" }}>{badge}</span>}
        </span>
        <span style={{ fontSize: 18, color: "var(--c-hint)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
      </button>
      {open && <div style={{ padding: "4px 20px 20px" }}>{children}</div>}
    </div>
  );
}

function DataTable({ columns, data, maxHeight }) {
  return (
    <div style={{ overflowX: "auto", overflowY: maxHeight ? "auto" : "visible", maxHeight, borderRadius: 2, border: `1px solid ${IEQ.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{ padding: "10px 12px", color: IEQ.navy, textAlign: col.align || "left", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap", position: "sticky", top: 0, background: IEQ.cream, borderBottom: `2px solid ${IEQ.gold}`, zIndex: 1, fontFamily: "Georgia, serif" }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: `1px solid ${IEQ.borderLight}` }}>
              {columns.map((col, ci) => (
                <td key={ci} style={{ padding: "10px 12px", textAlign: col.align || "left", whiteSpace: "nowrap", color: IEQ.textDark }}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// CHARTS
// ============================================================
function MiniBar({ data, height = 160 }) {
  const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const bw = Math.min(32, (100 / data.length) * 0.72);
  return (
    <div style={{ position: "relative", height, width: "100%", marginTop: 8 }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: IEQ.border }} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: "82%" }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: `${bw}%` }}>
            <div style={{ width: "100%", maxWidth: 28, borderRadius: "2px 2px 0 0", height: `${Math.max((Math.abs(d.value) / maxVal) * 82, 2)}%`, background: d.highlight ? IEQ.navy : IEQ.gold, opacity: 0.95 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ fontSize: 10, color: IEQ.textLight, textAlign: "center", width: `${bw}%` }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

function ProjectionChart({ mainData, scenarioData, retirementAge, liquidityThreshold, mode = "wealth" }) {
  if (!mainData || mainData.length === 0) return null;

  const mainSeries = mode === "liquidity" ? mainData.map(d => d.taxable) : mainData.map(d => d.wealth);
  const scenSeries = scenarioData ? (mode === "liquidity" ? scenarioData.map(d => d.taxable) : scenarioData.map(d => d.wealth)) : null;
  const allData = scenSeries ? [...mainSeries, ...scenSeries] : mainSeries;

  const maxW = Math.max(...allData, 1);
  const minW = Math.min(...allData, 0);
  const range = maxW - minW || 1;
  const h = 290;
  const w = 760;
  const pad = { t: 22, r: 22, b: 38, l: 70 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const toPoints = (data, liquidity = false) => data.map((d, i) => {
    const val = liquidity ? d.taxable : d.wealth;
    const x = pad.l + (i / (data.length - 1)) * cw;
    const y = pad.t + ((maxW - val) / range) * ch;
    return `${x},${y}`;
  });

  const mainPts = toPoints(mainData, mode === "liquidity");
  const scenPts = scenarioData ? toPoints(scenarioData, mode === "liquidity") : null;
  const areaPts = [...mainPts, `${pad.l + cw},${pad.t + ch}`, `${pad.l},${pad.t + ch}`];
  const retireIdx = mainData.findIndex(d => d.age === retirementAge);
  const depletionYear = mode === "wealth" ? mainData.find(d => d.wealth <= 0) : null;
  const breachYear = mode === "liquidity" ? mainData.find(d => d.taxable < liquidityThreshold) : null;

  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => ({
    val: maxW - (i / yTicks) * range,
    y: pad.t + (i / yTicks) * ch,
  }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {retireIdx > 0 && retireIdx < mainData.length && (
        <rect x={pad.l} y={pad.t} width={(retireIdx / (mainData.length - 1)) * cw} height={ch} fill={IEQ.navy} opacity={0.03} />
      )}

      {yLabels.map((yl, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={yl.y} y2={yl.y} stroke={IEQ.borderLight} strokeWidth={0.7} strokeDasharray={yl.val === 0 ? "0" : "4,4"} />
          <text x={pad.l - 8} y={yl.y + 4} textAnchor="end" fontSize={10} fill={IEQ.textLight} fontFamily="Georgia, serif">{fmt(yl.val)}</text>
        </g>
      ))}

      {mode === "liquidity" && (
        (() => {
          const threshY = pad.t + ((maxW - liquidityThreshold) / range) * ch;
          return (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={threshY} y2={threshY} stroke={IEQ.warning} strokeWidth={1.2} strokeDasharray="6,4" />
              <text x={w - pad.r} y={threshY - 6} textAnchor="end" fontSize={9.5} fill={IEQ.warning} fontWeight={700}>
                Floor {fmt(liquidityThreshold)}
              </text>
            </g>
          );
        })()
      )}

      {minW < 0 && (
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + (maxW / range) * ch} y2={pad.t + (maxW / range) * ch} stroke={IEQ.danger} strokeWidth={1.2} />
      )}

      {retireIdx > 0 && retireIdx < mainData.length && (() => {
        const rx = pad.l + (retireIdx / (mainData.length - 1)) * cw;
        return (
          <g>
            <line x1={rx} x2={rx} y1={pad.t} y2={pad.t + ch} stroke={IEQ.navy} strokeWidth={1.1} strokeDasharray="6,4" opacity={0.8} />
            <text x={rx} y={pad.t - 5} textAnchor="middle" fontSize={9.5} fill={IEQ.navy} fontWeight={700}>Retire</text>
          </g>
        );
      })()}

      {mode === "liquidity" && breachYear && (() => {
        const bx = pad.l + (mainData.indexOf(breachYear) / (mainData.length - 1)) * cw;
        return (
          <g>
            <line x1={bx} x2={bx} y1={pad.t} y2={pad.t + ch} stroke={IEQ.warning} strokeWidth={1.2} strokeDasharray="4,4" />
            <text x={bx} y={h - 24} textAnchor="middle" fontSize={9.5} fill={IEQ.warning} fontWeight={700}>Breach</text>
          </g>
        );
      })()}

      {mode === "wealth" && depletionYear && (() => {
        const dx = pad.l + (mainData.indexOf(depletionYear) / (mainData.length - 1)) * cw;
        return (
          <g>
            <line x1={dx} x2={dx} y1={pad.t} y2={pad.t + ch} stroke={IEQ.danger} strokeWidth={1.5} strokeDasharray="6,4" />
            <text x={dx} y={pad.t - 4} textAnchor="middle" fontSize={10} fill={IEQ.danger} fontWeight={700}>Depletion</text>
          </g>
        );
      })()}

      <polygon points={areaPts.join(" ")} fill="url(#aGrad)" opacity={0.28} />
      <polyline points={mainPts.join(" ")} fill="none" stroke={IEQ.navy} strokeWidth={2.6} strokeLinejoin="round" />
      {scenPts && <polyline points={scenPts.join(" ")} fill="none" stroke={IEQ.navyMid} strokeWidth={2.1} strokeLinejoin="round" strokeDasharray="8,4" />}

      {mainData.filter((_, i) => i % Math.max(1, Math.floor(mainData.length / 6)) === 0 || i === mainData.length - 1).map(d => {
        const x = pad.l + (mainData.indexOf(d) / (mainData.length - 1)) * cw;
        return <text key={d.age} x={x} y={h - 8} textAnchor="middle" fontSize={10} fill={IEQ.textLight} fontFamily="Georgia, serif">Age {d.age}</text>;
      })}

      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={IEQ.navy} stopOpacity={0.4} />
          <stop offset="100%" stopColor={IEQ.navy} stopOpacity={0.02} />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Gauge({ value, label, danger, warning }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = danger ? IEQ.danger : warning ? IEQ.warning : IEQ.success;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: 100, height: 54, margin: "0 auto", overflow: "hidden" }}>
        <svg viewBox="0 0 100 54" style={{ width: "100%", height: "100%" }}>
          <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke={IEQ.border} strokeWidth={8} strokeLinecap="round" />
          <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(pct / 100) * 132} 132`} />
        </svg>
        <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, fontSize: 18, fontWeight: 800, color, fontFamily: "Georgia, serif" }}>{Math.round(value)}%</div>
      </div>
      <div style={{ fontSize: 11, color: IEQ.textLight, marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ============================================================
// TEMPORARY EMAIL-STYLE ACCESS GATE
// ============================================================
function AccessGate({ onUnlock }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const [error, setError] = useState("");

  const maskedEmail = useMemo(() => {
    const [local, domain] = (email || "").split("@");
    if (!local || !domain) return email;
    return `${local.slice(0, 2)}***@${domain}`;
  }, [email]);

  const sendCode = () => {
    if (!email || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setIssuedCode(generated);
    setError("");
    setStep(2);
  };

  const verifyCode = () => {
    if (code === issuedCode) {
      onUnlock(email);
      return;
    }
    setError("Incorrect passcode. Use the mock code shown below.");
  };

  return (
    <div style={{ minHeight: "100vh", background: IEQ.offWhite, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <Card style={{ padding: 34 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
            <IEQLogo />
            <div>
              <div style={{ fontSize: 11, color: IEQ.textLight, letterSpacing: 1.5, textTransform: "uppercase" }}>Secure Client Portal</div>
              <div style={{ fontSize: 28, color: IEQ.navy, fontFamily: "Georgia, serif", fontWeight: 400 }}>Temporary Access Verification</div>
            </div>
          </div>

          {step === 1 && (
            <>
              <div style={{ fontSize: 14, color: IEQ.textMid, lineHeight: 1.6, marginBottom: 18 }}>
                Enter your email address below to receive a one-time passcode and access the portal.
              </div>
              <TextInput
                label="Email Address"
                value={email}
                onChange={setEmail}
                placeholder="name@example.com"
                hint="Each user can enter their own email address"
              />
              {error && <div style={{ marginBottom: 12, color: IEQ.danger, fontSize: 12.5 }}>{error}</div>}
              <button
                onClick={sendCode}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  borderRadius: 2,
                  border: "none",
                  background: IEQ.navy,
                  color: IEQ.white,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "Georgia, serif"
                }}
              >
                Send One-Time Passcode
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ fontSize: 14, color: IEQ.textMid, lineHeight: 1.6, marginBottom: 16 }}>
                A one-time passcode was sent to <strong>{maskedEmail}</strong>.
              </div>

              <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 2, background: IEQ.infoBg, border: `1px solid ${IEQ.borderLight}`, fontSize: 12.5, color: IEQ.navy }}>
                <strong>Mock flow only:</strong> in a real build this passcode would be emailed to the address entered above. For now, use this temporary code: <span style={{ fontFamily: "monospace", fontSize: 14 }}>{issuedCode}</span>
              </div>

              <TextInput label="One-Time Passcode" value={code} onChange={setCode} placeholder="6-digit passcode" />
              {error && <div style={{ marginBottom: 12, color: IEQ.danger, fontSize: 12.5 }}>{error}</div>}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setStep(1); setCode(""); setError(""); }} style={{ flex: 1, padding: "14px 18px", borderRadius: 2, border: `1px solid ${IEQ.border}`, background: IEQ.white, color: IEQ.textMid, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  Back
                </button>
                <button onClick={verifyCode} style={{ flex: 1, padding: "14px 18px", borderRadius: 2, border: "none", background: IEQ.navy, color: IEQ.white, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Georgia, serif" }}>
                  Verify & Enter
                </button>
              </div>
            </>
          )}

          <div style={{ marginTop: 18, fontSize: 11.5, color: IEQ.textLight, lineHeight: 1.6 }}>
            This is a temporary front-end-only access gate for presentation and workflow testing. It is not a substitute for real authentication.
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// AI ADVISOR
// ============================================================
function buildAdvisorResponse(query, p, main, scenario) {
  const q = query.toLowerCase().trim();

  if (/hello|hi|hey/.test(q)) {
    return `Good day. Current liquid capital is ${fmtFull(main.currentLiquid)}, with ${main.cushionMonths.toFixed(1)} months of runway and a ${fmtFull(p.liquidityThreshold)} liquidity floor. Ending projected wealth is ${fmtFull(main.wealthAtEnd)}.`;
  }

  if (/liquid|liquidity|runway|cash/.test(q)) {
    return `Current liquid capital is ${fmtFull(main.currentLiquid)}. Reserve policy requires ${fmtFull(main.reserveTargetStart)}, and your liquidity floor is ${fmtFull(p.liquidityThreshold)}. Base runway is ${main.cushionMonths.toFixed(1)} months. After annual capital calls of ${fmtFull(p.annualCapitalCalls)}, stress runway falls to ${main.stressRunwayNow.toFixed(1)} months.${main.liquidBreachAge ? ` Liquid assets are projected to breach the floor by age ${main.liquidBreachAge}.` : " No liquidity floor breach is projected in the base case."}`;
  }

  if (/capital call|calls|commitment|distribution/.test(q)) {
    return `The model assumes ${fmtFull(p.annualCapitalCalls)} of annual capital calls and ${fmtFull(p.annualDistributions)} of annual distributions. Net private-capital cash drag is ${fmtFull((p.annualCapitalCalls || 0) - (p.annualDistributions || 0))} per year before investment growth. Post-call liquidity today is ${fmtFull(main.postCallLiquidity)}.`;
  }

  if (/retire|retirement|withdrawal/.test(q)) {
    return `Projected wealth at retirement age ${p.retirementAge} is ${fmtFull(main.wealthAtRetirement)}. Estimated retirement withdrawal rate is ${main.withdrawalRate.toFixed(1)}%. ${main.withdrawalRate > 5 ? "That rate is elevated and deserves adjustment." : main.withdrawalRate > 4 ? "That rate is slightly elevated." : "That rate is within a reasonable planning range."}`;
  }

  if (/rmd|tax|taxes|bracket/.test(q)) {
    const firstRMD = main.projection.find(d => d.rmd > 0);
    const bracket = main.projection[0]?.marginalBracket || 0;
    return `${firstRMD ? `RMDs begin at age ${firstRMD.age} and start at approximately ${fmtFull(firstRMD.rmd)} per year. ` : ""}Current projected marginal bracket is ${bracket}%. The model applies an effective tax rate of ${p.effectiveTaxRate}% and also tracks federal bracket pressure year by year.`;
  }

  if (/scenario|what if|compare/.test(q)) {
    if (!scenario) {
      return `Scenario mode is currently off. Turn on a scenario in the Scenarios tab to compare alternatives such as working longer, spending less, income reduction, or a capital call shock.`;
    }
    return `The active scenario changes ending wealth from ${fmtFull(main.wealthAtEnd)} to ${fmtFull(scenario.wealthAtEnd)}. Liquidity minimum changes from ${fmtFull(main.minimumLiquidBalance)} to ${fmtFull(scenario.minimumLiquidBalance)}. ${scenario.wealthAtEnd > main.wealthAtEnd ? "The scenario improves plan durability." : "The scenario weakens the plan versus base case."}`;
  }

  if (/spending|expense|expenses|burn/.test(q)) {
    return `Current monthly spending is ${fmtFull(main.totalMonthlyBase)}, made up of ${fmtFull(main.fixedMonthly)} fixed and ${fmtFull(main.variableMonthly)} variable expenses. Annual inflation increases expenses over time, and healthcare can rise faster under the medical inflation assumption.`;
  }

  if (/summary|overview|status/.test(q)) {
    return `Base case summary: liquid capital ${fmtFull(main.currentLiquid)}, total assets ${fmtFull(main.totalAssets)}, runway ${main.cushionMonths.toFixed(1)} months, ending wealth ${fmtFull(main.wealthAtEnd)}, and ${main.depletionAge ? `total asset depletion at age ${main.depletionAge}` : "no total asset depletion through the plan horizon"}.`;
  }

  return `I can answer questions about liquidity, runway, capital calls, retirement sustainability, taxes, RMDs, expenses, and scenarios. Try asking: "What is my liquidity position?", "How severe are capital calls?", or "How sustainable is retirement?"`;
}

function AIAdvisorPage({ p, main, scenario }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: `Welcome to the IEQ Advisor console. Current liquid capital is ${fmtFull(main.currentLiquid)} and projected ending wealth is ${fmtFull(main.wealthAtEnd)}. Ask about liquidity, taxes, retirement durability, or scenario outcomes.`,
      time: new Date(),
    },
  ]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    const userText = input.trim();
    const assistantText = buildAdvisorResponse(userText, p, main, scenario);
    setMessages(prev => [
      ...prev,
      { role: "user", text: userText, time: new Date() },
      { role: "assistant", text: assistantText, time: new Date() },
    ]);
    setInput("");
  };

  return (
    <div>
      <SectionTitle subtitle="High-trust analytical interface for liquidity, planning, and scenario questions">AI Advisor</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${IEQ.borderLight}`, background: IEQ.navy }}>
            <div style={{ fontSize: 15, color: IEQ.white, fontFamily: "Georgia, serif" }}>Advisor Conversation</div>
            <div style={{ fontSize: 10.5, color: IEQ.goldLight, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 2 }}>Data-grounded analysis</div>
          </div>

          <div style={{ padding: 18, minHeight: 420, maxHeight: 420, overflowY: "auto", background: IEQ.white }}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "88%", padding: "12px 14px", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.role === "user" ? IEQ.navy : IEQ.offWhite, color: m.role === "user" ? IEQ.white : IEQ.textDark, border: m.role === "user" ? "none" : `1px solid ${IEQ.borderLight}`, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {m.text}
                </div>
                <div style={{ fontSize: 10, color: IEQ.textLight, marginTop: 4 }}>
                  {m.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: 16, borderTop: `1px solid ${IEQ.borderLight}`, display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask about liquidity, taxes, capital calls, retirement..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: 2, border: `1px solid ${IEQ.border}`, outline: "none", fontSize: 13, background: IEQ.offWhite }}
            />
            <button onClick={send} style={{ padding: "10px 18px", borderRadius: 2, border: "none", background: IEQ.navy, color: IEQ.white, fontWeight: 700, cursor: "pointer", fontFamily: "Georgia, serif" }}>
              Send
            </button>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: IEQ.textLight, letterSpacing: 1.2 }}>Suggested Questions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {[
                "What is my liquidity position?",
                "How severe are capital calls?",
                "How sustainable is retirement?",
                "When do RMDs start?",
                "Compare my scenario to base case",
              ].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  style={{ textAlign: "left", padding: "10px 12px", borderRadius: 2, border: `1px solid ${IEQ.border}`, background: IEQ.offWhite, color: IEQ.textMid, fontSize: 12.5, cursor: "pointer" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: IEQ.textLight, letterSpacing: 1.2 }}>Current Snapshot</div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Liquid capital</span><strong>{fmtFull(main.currentLiquid)}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Runway</span><strong>{main.cushionMonths.toFixed(1)} mo</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Capital calls</span><strong>{fmtFull(p.annualCapitalCalls)}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Ending wealth</span><strong>{fmtFull(main.wealthAtEnd)}</strong></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PAGES
// ============================================================
function ExecutiveSummaryPage({ p, main, scenario, recs, expenseBreakdown, safetyScore, isCurrentlyWorking, yearsUntilRetirement }) {
  const liquidityBreakdown = [
    { label: "Liquid", value: main.currentLiquid, highlight: true },
    { label: "Reserve", value: main.reserveTargetStart },
    { label: "Calls", value: p.annualCapitalCalls || 0 },
    { label: "Dist.", value: p.annualDistributions || 0 },
    { label: "Excess", value: Math.max(0, main.currentLiquid - main.reserveTargetStart) },
  ];

  const statBox = (label, value, sub, accent) => (
    <div style={{ background: IEQ.white, borderRadius: 4, padding: "16px 18px", border: `1px solid ${IEQ.borderLight}`, flex: "1 1 150px", minWidth: 150, boxShadow: "0 1px 3px rgba(15,29,74,0.03)" }}>
      <div style={{ fontSize: 10, color: IEQ.textLight, fontWeight: 700, marginBottom: 3, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent || IEQ.textDark, fontFamily: "Georgia, serif", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: IEQ.textLight, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <SectionTitle subtitle="Liquidity-first overview of the household plan and long-term durability">Executive Summary</SectionTitle>

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "12px 0 20px", flexWrap: "wrap" }}>
        {safetyScore >= 75 ? <StatusBadge status="good" label="Plan On Track" /> : safetyScore >= 45 ? <StatusBadge status="warning" label="Needs Attention" /> : <StatusBadge status="danger" label="Action Required" />}
        <PhasePill isWorking={isCurrentlyWorking} />
        <span style={{ fontSize: 13, color: IEQ.textLight }}>
          Safety Score: <strong style={{ color: IEQ.textDark }}>{safetyScore}/100</strong>{isCurrentlyWorking ? ` · ${yearsUntilRetirement}yr to retirement` : ""}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {statBox("Monthly Net Income", fmtFull(main.currentMonthlyNet), `${fmtFull(main.currentMonthlyGross)} gross`)}
        {statBox("Monthly Spending", fmtFull(main.totalMonthlyBase), `${fmtFull(main.fixedMonthly)} fixed + ${fmtFull(main.variableMonthly)} variable`)}
        {statBox("Monthly Surplus / Gap", fmtFull(main.monthlyGap), main.monthlyGap >= 0 ? "Income covers expenses" : "Shortfall funded from assets", main.monthlyGap >= 0 ? IEQ.success : IEQ.danger)}
        {statBox("Total Assets", fmtFull(main.totalAssets), `${fmtFull(main.preTaxStart)} pre-tax · ${fmtFull(main.totalAssets - main.preTaxStart)} liquid/taxable`)}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        {statBox("Current Liquid", fmtFull(main.currentLiquid), `Liquidity ratio ${(main.liquidityRatio * 100).toFixed(1)}%`, main.currentLiquid >= p.liquidityThreshold ? IEQ.success : IEQ.danger)}
        {statBox("Liquidity Floor", fmtFull(p.liquidityThreshold), main.liquidBreachAge ? `Breach age ${main.liquidBreachAge}` : "No projected breach", main.liquidBreachAge ? IEQ.warning : IEQ.textDark)}
        {statBox("Runway", `${main.cushionMonths.toFixed(1)} mo`, `Reserve target ${fmtFull(main.reserveTargetStart)}`, main.cushionMonths >= p.liquidityReserveMonths ? IEQ.success : IEQ.warning)}
        {statBox("Stress Runway", `${main.stressRunwayNow.toFixed(1)} mo`, `After ${fmtFull(p.annualCapitalCalls)} calls`, main.stressRunwayNow >= p.liquidityReserveMonths ? IEQ.success : IEQ.danger)}
        {statBox("Ret. Withdrawal", `${main.withdrawalRate.toFixed(1)}%`, `At age ${p.retirementAge}`, main.withdrawalRate > 5 ? IEQ.danger : main.withdrawalRate > 4 ? IEQ.warning : IEQ.success)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "Georgia, serif", color: IEQ.navy }}>Wealth Projection to Age {p.planToAge}</div>
            {scenario && (
              <div style={{ display: "flex", gap: 12, fontSize: 11, alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 16, height: 3, background: IEQ.navy, display: "inline-block" }} /> Base</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 16, height: 3, background: IEQ.navyMid, display: "inline-block" }} /> Scenario</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: IEQ.textLight, marginBottom: 8 }}>
            {main.depletionAge ? `Funds may run out at age ${main.depletionAge}` : `Ending assets: ${fmtFull(main.wealthAtEnd)}`}
            {scenario && ` · Scenario ending assets: ${fmtFull(scenario.wealthAtEnd)}`}
          </div>
          <ProjectionChart mainData={main.projection} scenarioData={scenario?.projection} retirementAge={p.retirementAge} liquidityThreshold={p.liquidityThreshold} mode="wealth" />
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, fontFamily: "Georgia, serif", color: IEQ.navy }}>Liquidity Framework</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Current liquid capital</span><strong>{fmtFull(main.currentLiquid)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Reserve target</span><strong>{fmtFull(main.reserveTargetStart)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Liquidity floor</span><strong>{fmtFull(p.liquidityThreshold)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Annual capital calls</span><strong style={{ color: IEQ.warning }}>{fmtFull(p.annualCapitalCalls)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Annual distributions</span><strong style={{ color: IEQ.success }}>{fmtFull(p.annualDistributions)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Post-call liquidity</span><strong style={{ color: main.postCallLiquidity >= p.liquidityThreshold ? IEQ.success : IEQ.danger }}>{fmtFull(main.postCallLiquidity)}</strong></div>
          </div>
          <MiniBar data={liquidityBreakdown} height={120} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, fontFamily: "Georgia, serif", color: IEQ.navy }}>Monthly Spending Mix</div>
          {p.useHealthcareInflation && <div style={{ fontSize: 11, color: IEQ.warning, marginBottom: 4 }}>Healthcare inflation: {p.healthcareInflationRate}% vs {p.inflationRate}% general</div>}
          <MiniBar data={expenseBreakdown.map((d, i) => ({ ...d, highlight: i < 3 }))} height={170} />
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "Georgia, serif", color: IEQ.navy }}>Planning Quality</div>
          <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            <Gauge value={main.fundedPct} label="Years Funded" danger={main.fundedPct < 50} warning={main.fundedPct < 80} />
            <Gauge value={Math.min(100, (4 / Math.max(main.withdrawalRate, 0.1)) * 100)} label="Withdrawal Safety" danger={main.withdrawalRate > 6} warning={main.withdrawalRate > 4} />
            <Gauge value={Math.min(100, (main.cushionMonths / Math.max(1, p.liquidityReserveMonths)) * 100)} label="Liquidity Runway" danger={main.cushionMonths < 6} warning={main.cushionMonths < p.liquidityReserveMonths} />
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "Georgia, serif", color: IEQ.navy }}>Advisory Observations</div>
        {recs.map((r, i) => (
          <div key={i} style={{ padding: "12px 16px", borderRadius: 2, marginBottom: 8, background: r.type === "danger" ? IEQ.dangerBg : r.type === "warning" ? IEQ.warningBg : IEQ.successBg, borderLeft: `3px solid ${r.type === "danger" ? IEQ.danger : r.type === "warning" ? IEQ.warning : IEQ.success}`, fontSize: 13.5, lineHeight: 1.5 }}>
            {r.text}
          </div>
        ))}
      </Card>
    </div>
  );
}

function LiquidityPage({ p, main, scenario }) {
  const liquidityData = main.projection.map(d => ({
    age: d.age,
    taxable: d.taxable,
    reserveTarget: d.reserveTarget,
    stressRunway: d.stressRunwayMonths,
  }));

  return (
    <div>
      <SectionTitle subtitle="Dedicated review of liquid capital, reserve policy, and commitment stress">Liquidity Analysis</SectionTitle>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <Card style={{ flex: "1 1 180px" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", color: IEQ.textLight, letterSpacing: 1.2 }}>Current Liquid</div>
          <div style={{ fontSize: 28, fontFamily: "Georgia, serif", color: IEQ.navy, marginTop: 6 }}>{fmtFull(main.currentLiquid)}</div>
          <div style={{ fontSize: 11, color: IEQ.textLight, marginTop: 4 }}>Cash + taxable accounts</div>
        </Card>
        <Card style={{ flex: "1 1 180px" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", color: IEQ.textLight, letterSpacing: 1.2 }}>Reserve Target</div>
          <div style={{ fontSize: 28, fontFamily: "Georgia, serif", color: IEQ.navy, marginTop: 6 }}>{fmtFull(main.reserveTargetStart)}</div>
          <div style={{ fontSize: 11, color: IEQ.textLight, marginTop: 4 }}>{p.liquidityReserveMonths} months of spending</div>
        </Card>
        <Card style={{ flex: "1 1 180px" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", color: IEQ.textLight, letterSpacing: 1.2 }}>Post-Call Liquidity</div>
          <div style={{ fontSize: 28, fontFamily: "Georgia, serif", color: main.postCallLiquidity >= p.liquidityThreshold ? IEQ.success : IEQ.danger, marginTop: 6 }}>{fmtFull(main.postCallLiquidity)}</div>
          <div style={{ fontSize: 11, color: IEQ.textLight, marginTop: 4 }}>After annual calls</div>
        </Card>
        <Card style={{ flex: "1 1 180px" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", color: IEQ.textLight, letterSpacing: 1.2 }}>Stress Runway</div>
          <div style={{ fontSize: 28, fontFamily: "Georgia, serif", color: main.stressRunwayNow >= p.liquidityReserveMonths ? IEQ.success : IEQ.warning, marginTop: 6 }}>{main.stressRunwayNow.toFixed(1)} mo</div>
          <div style={{ fontSize: 11, color: IEQ.textLight, marginTop: 4 }}>Runway after calls</div>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, fontFamily: "Georgia, serif", color: IEQ.navy }}>Projected Liquid Capital</div>
        <div style={{ fontSize: 12, color: IEQ.textLight, marginBottom: 8 }}>
          {main.liquidBreachAge ? `Liquidity floor breach projected at age ${main.liquidBreachAge}${main.liquidRecoveryAge ? ` with recovery at age ${main.liquidRecoveryAge}` : ""}.` : "No liquidity floor breach projected in the base case."}
          {scenario && ` Scenario ending liquid minimum: ${fmtFull(scenario.minimumLiquidBalance)}.`}
        </div>
        <ProjectionChart mainData={main.projection} scenarioData={scenario?.projection} retirementAge={p.retirementAge} liquidityThreshold={p.liquidityThreshold} mode="liquidity" />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "Georgia, serif", color: IEQ.navy }}>Liquidity Governance</div>
          <DataTable
            columns={[
              { label: "Metric", key: "metric" },
              { label: "Value", align: "right", render: r => <span style={{ fontWeight: 700, fontFamily: "Georgia, serif" }}>{r.value}</span> },
            ]}
            data={[
              { metric: "Current liquid capital", value: fmtFull(main.currentLiquid) },
              { metric: "Liquidity floor", value: fmtFull(p.liquidityThreshold) },
              { metric: `${p.liquidityReserveMonths}-month reserve target`, value: fmtFull(main.reserveTargetStart) },
              { metric: "Annual capital calls", value: fmtFull(p.annualCapitalCalls) },
              { metric: "Annual distributions", value: fmtFull(p.annualDistributions) },
              { metric: "Base runway", value: `${main.cushionMonths.toFixed(1)} months` },
              { metric: "Stress runway", value: `${main.stressRunwayNow.toFixed(1)} months` },
              { metric: "Minimum projected liquidity", value: fmtFull(main.minimumLiquidBalance) },
            ]}
          />
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "Georgia, serif", color: IEQ.navy }}>Liquidity Monitoring</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "12px 14px", background: main.currentLiquid >= main.reserveTargetStart ? IEQ.successBg : IEQ.warningBg, borderLeft: `3px solid ${main.currentLiquid >= main.reserveTargetStart ? IEQ.success : IEQ.warning}`, fontSize: 13 }}>
              {main.currentLiquid >= main.reserveTargetStart ? "Current liquid capital exceeds reserve target." : "Current liquid capital is below reserve target."}
            </div>
            <div style={{ padding: "12px 14px", background: main.postCallLiquidity >= p.liquidityThreshold ? IEQ.successBg : IEQ.dangerBg, borderLeft: `3px solid ${main.postCallLiquidity >= p.liquidityThreshold ? IEQ.success : IEQ.danger}`, fontSize: 13 }}>
              {main.postCallLiquidity >= p.liquidityThreshold ? "Post-call liquidity remains above floor." : "Annual capital calls would push liquidity below floor today."}
            </div>
            <div style={{ padding: "12px 14px", background: main.liquidBreachAge ? IEQ.warningBg : IEQ.successBg, borderLeft: `3px solid ${main.liquidBreachAge ? IEQ.warning : IEQ.success}`, fontSize: 13 }}>
              {main.liquidBreachAge ? `Projected liquidity breach at age ${main.liquidBreachAge}.` : "No projected liquidity breach under base assumptions."}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "Georgia, serif", color: IEQ.navy }}>Selected Annual Liquidity Snapshot</div>
        <DataTable
          maxHeight={320}
          columns={[
            { label: "Age", align: "right", render: r => r.age },
            { label: "Liquid", align: "right", render: r => fmtFull(r.taxable) },
            { label: "Reserve", align: "right", render: r => fmtFull(r.reserveTarget) },
            { label: "Above / (Below)", align: "right", render: r => <span style={{ color: r.liquidAboveReserve >= 0 ? IEQ.success : IEQ.danger, fontWeight: 700 }}>{fmtFull(r.liquidAboveReserve)}</span> },
            { label: "Runway", align: "right", render: r => `${r.runwayMonths.toFixed(1)} mo` },
          ]}
          data={liquidityData.filter((_, i) => i % Math.max(1, Math.floor(liquidityData.length / 12)) === 0 || i === liquidityData.length - 1)}
        />
      </Card>
    </div>
  );
}

function InputsPage({ p, upd, isCurrentlyWorking }) {
  return (
    <div>
      <SectionTitle subtitle="Update assumptions for income, assets, spending, taxes, and liquidity policy">Inputs</SectionTitle>

      <Section title="About You" icon="●">
        <NumberInput label="Current Age" value={p.age} onChange={v => upd("age", v)} prefix="" hint="years" />
        <NumberInput label="Plan Through Age" value={p.planToAge} onChange={v => upd("planToAge", v)} prefix="" hint="planning horizon" />
      </Section>

      <Section title="Employment & Salary" icon="●" badge={isCurrentlyWorking ? "Active" : "Retired"}>
        <NumberInput label="Monthly Salary" value={p.monthlySalary} onChange={v => upd("monthlySalary", v)} hint="gross monthly income while working" />
        <NumberInput label="Retirement Age" value={p.retirementAge} onChange={v => upd("retirementAge", v)} prefix="" />
        <PercentInput label="Annual Raise Assumption" value={p.annualRaises} onChange={v => upd("annualRaises", v)} />
        <PercentInput label="Savings Rate" value={p.savingsRatePercent} onChange={v => upd("savingsRatePercent", v)} hint="of salary" />
      </Section>

      <Section title="Retirement Income" icon="●">
        <NumberInput label="Social Security" value={p.socialSecurity} onChange={v => upd("socialSecurity", v)} />
        <NumberInput label="Social Security Start Age" value={p.ssStartAge} onChange={v => upd("ssStartAge", v)} prefix="" />
        <NumberInput label="Pension" value={p.pension} onChange={v => upd("pension", v)} />
        <NumberInput label="Annuity Income" value={p.annuityIncome} onChange={v => upd("annuityIncome", v)} />
        <NumberInput label="Rental Income" value={p.rentalIncome} onChange={v => upd("rentalIncome", v)} />
        <NumberInput label="Other Income" value={p.otherIncome} onChange={v => upd("otherIncome", v)} />
      </Section>

      <Section title="Assets" icon="●">
        <NumberInput label="Liquid Savings" value={p.liquidSavings} onChange={v => upd("liquidSavings", v)} />
        <NumberInput label="Pre-Tax Accounts" value={p.preTaxAccounts} onChange={v => upd("preTaxAccounts", v)} />
        <NumberInput label="Taxable Accounts" value={p.taxableAccounts} onChange={v => upd("taxableAccounts", v)} />
        <PercentInput label="Expected Return" value={p.expectedReturn} onChange={v => upd("expectedReturn", v)} />
        <PercentInput label="Inflation" value={p.inflationRate} onChange={v => upd("inflationRate", v)} />
      </Section>

      <Section title="Liquidity Framework" icon="●">
        <NumberInput label="Liquidity Floor" value={p.liquidityThreshold} onChange={v => upd("liquidityThreshold", v)} />
        <NumberInput label="Reserve Policy (Months)" value={p.liquidityReserveMonths} onChange={v => upd("liquidityReserveMonths", v)} prefix="" />
        <NumberInput label="Annual Capital Calls" value={p.annualCapitalCalls} onChange={v => upd("annualCapitalCalls", v)} />
        <NumberInput label="Annual Distributions" value={p.annualDistributions} onChange={v => upd("annualDistributions", v)} />
      </Section>

      <Section title="Taxes & Healthcare" icon="●">
        <SelectInput label="Filing Status" value={p.filingStatus} onChange={v => upd("filingStatus", v)} options={[{ value: "single", label: "Single" }, { value: "married", label: "Married Filing Jointly" }]} />
        <PercentInput label="Effective Tax Rate" value={p.effectiveTaxRate} onChange={v => upd("effectiveTaxRate", v)} />
        <NumberInput label="Monthly Healthcare" value={p.healthcare} onChange={v => upd("healthcare", v)} />
        <Toggle label="Use Higher Healthcare Inflation" value={p.useHealthcareInflation} onChange={v => upd("useHealthcareInflation", v)} />
        {p.useHealthcareInflation && <PercentInput label="Healthcare Inflation" value={p.healthcareInflationRate} onChange={v => upd("healthcareInflationRate", v)} />}
      </Section>

      <Section title="Fixed Expenses" icon="●">
        <NumberInput label="Housing" value={p.housing} onChange={v => upd("housing", v)} />
        <NumberInput label="Insurance" value={p.insurance} onChange={v => upd("insurance", v)} />
        <NumberInput label="Utilities" value={p.utilities} onChange={v => upd("utilities", v)} />
        <NumberInput label="Debt Payments" value={p.debtPayments} onChange={v => upd("debtPayments", v)} />
        <NumberInput label="Taxes (Non-Income)" value={p.taxes} onChange={v => upd("taxes", v)} />
      </Section>

      <Section title="Variable Expenses" icon="●">
        <NumberInput label="Groceries" value={p.groceries} onChange={v => upd("groceries", v)} />
        <NumberInput label="Dining" value={p.dining} onChange={v => upd("dining", v)} />
        <NumberInput label="Transportation" value={p.transportation} onChange={v => upd("transportation", v)} />
        <NumberInput label="Entertainment" value={p.entertainment} onChange={v => upd("entertainment", v)} />
        <NumberInput label="Travel" value={p.travel} onChange={v => upd("travel", v)} />
        <NumberInput label="Gifts & Charity" value={p.giftsCharity} onChange={v => upd("giftsCharity", v)} />
        <NumberInput label="Personal Care" value={p.personalCare} onChange={v => upd("personalCare", v)} />
        <NumberInput label="Miscellaneous" value={p.miscellaneous} onChange={v => upd("miscellaneous", v)} />
      </Section>

      <Section title="One-Time Events" icon="●">
        <NumberInput label="Large Expense Amount" value={p.plannedLargeExpenses} onChange={v => upd("plannedLargeExpenses", v)} />
        <NumberInput label="Large Expense in Years" value={p.largeExpenseYear} onChange={v => upd("largeExpenseYear", v)} prefix="" />
        <NumberInput label="Home Purchase Amount" value={p.homePurchaseAmount} onChange={v => upd("homePurchaseAmount", v)} />
        <NumberInput label="Home Purchase Age" value={p.homePurchaseAge} onChange={v => upd("homePurchaseAge", v)} prefix="" />
      </Section>
    </div>
  );
}

function ScenarioPage({ p, upd, main, scenario }) {
  const scenarioOptions = [
    { value: "retireLater", label: "Work Longer" },
    { value: "cutSpending", label: "Cut Spending" },
    { value: "delaySS", label: "Delay Social Security" },
    { value: "savingsBoost", label: "Save More" },
    { value: "capitalCallShock", label: "Capital Call Shock" },
    { value: "recurringExpense", label: "Recurring Expense Shock" },
    { value: "incomeDrop", label: "Income Reduction" },
  ];

  return (
    <div>
      <SectionTitle subtitle="Stress test the plan with a single active scenario against the base case">Scenarios</SectionTitle>

      <Card style={{ marginBottom: 16 }}>
        <Toggle label="Enable Scenario" value={p.scenarioEnabled} onChange={v => upd("scenarioEnabled", v)} hint="Compare one scenario to the base plan" />
        {p.scenarioEnabled && (
          <>
            <SelectInput label="Scenario Type" value={p.scenarioType} onChange={v => upd("scenarioType", v)} options={scenarioOptions} />

            {p.scenarioType === "retireLater" && <NumberInput label="Retire at Age" value={p.scenarioRetireAge} onChange={v => upd("scenarioRetireAge", v)} prefix="" />}
            {p.scenarioType === "cutSpending" && <NumberInput label="Cut Spending by ($/month)" value={p.scenarioCutAmount} onChange={v => upd("scenarioCutAmount", v)} />}
            {p.scenarioType === "delaySS" && <NumberInput label="Start Social Security at Age" value={p.scenarioSSAge} onChange={v => upd("scenarioSSAge", v)} prefix="" />}
            {p.scenarioType === "savingsBoost" && <PercentInput label="New Savings Rate" value={p.scenarioSavingsRate} onChange={v => upd("scenarioSavingsRate", v)} />}
            {p.scenarioType === "capitalCallShock" && (
              <>
                <NumberInput label="Additional Capital Call" value={p.scenarioCapitalCallAmount} onChange={v => upd("scenarioCapitalCallAmount", v)} />
                <NumberInput label="Capital Call Age" value={p.scenarioCapitalCallAge} onChange={v => upd("scenarioCapitalCallAge", v)} prefix="" />
              </>
            )}
            {p.scenarioType === "recurringExpense" && (
              <>
                <NumberInput label="Additional Monthly Expense" value={p.scenarioRecurringExpense} onChange={v => upd("scenarioRecurringExpense", v)} />
                <NumberInput label="Start Age" value={p.scenarioRecurringExpenseStartAge} onChange={v => upd("scenarioRecurringExpenseStartAge", v)} prefix="" />
              </>
            )}
            {p.scenarioType === "incomeDrop" && <PercentInput label="Income Reduction" value={p.scenarioIncomeDropPct} onChange={v => upd("scenarioIncomeDropPct", v)} />}
          </>
        )}
      </Card>

      {scenario && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <Card>
              <div style={{ fontSize: 11, color: IEQ.textLight, textTransform: "uppercase", letterSpacing: 1.2 }}>Base Plan</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Ending wealth</span><strong>{fmtFull(main.wealthAtEnd)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Minimum liquidity</span><strong>{fmtFull(main.minimumLiquidBalance)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Withdrawal rate</span><strong>{main.withdrawalRate.toFixed(1)}%</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Liquidity breach</span><strong>{main.liquidBreachAge ? `Age ${main.liquidBreachAge}` : "None"}</strong></div>
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 11, color: IEQ.navyMid, textTransform: "uppercase", letterSpacing: 1.2 }}>Scenario</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Ending wealth</span><strong style={{ color: scenario.wealthAtEnd > main.wealthAtEnd ? IEQ.success : IEQ.danger }}>{fmtFull(scenario.wealthAtEnd)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Minimum liquidity</span><strong>{fmtFull(scenario.minimumLiquidBalance)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Withdrawal rate</span><strong>{scenario.withdrawalRate.toFixed(1)}%</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: IEQ.textLight }}>Liquidity breach</span><strong>{scenario.liquidBreachAge ? `Age ${scenario.liquidBreachAge}` : "None"}</strong></div>
              </div>
            </Card>
          </div>

          <Card>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, fontFamily: "Georgia, serif", color: IEQ.navy }}>Scenario Comparison</div>
            <ProjectionChart mainData={main.projection} scenarioData={scenario.projection} retirementAge={p.retirementAge} liquidityThreshold={p.liquidityThreshold} mode="wealth" />
          </Card>
        </>
      )}
    </div>
  );
}

function DetailsPage({ p, main }) {
  const rows = main.projection.filter((_, i) => i % (main.projection.length > 20 ? Math.ceil(main.projection.length / 18) : 1) === 0 || i === main.projection.length - 1);

  return (
    <div>
      <SectionTitle subtitle="Year-by-year projection with liquidity, taxes, RMDs, and capital activity">Projection Detail</SectionTitle>

      <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <DataTable
          maxHeight={420}
          columns={[
            { label: "Age", align: "right", render: r => r.age },
            { label: "Phase", render: r => <Badge color={r.phase === "working" ? IEQ.navy : IEQ.gold}>{r.phase === "working" ? "Work" : "Ret"}</Badge> },
            { label: "Income", align: "right", render: r => fmtFull(r.annualIncome) },
            { label: "RMD", align: "right", render: r => (r.rmd > 0 ? fmtFull(r.rmd) : "—") },
            { label: "Calls", align: "right", render: r => (r.capitalCalls > 0 ? fmtFull(r.capitalCalls) : "—") },
            { label: "Dist.", align: "right", render: r => (r.distributions > 0 ? fmtFull(r.distributions) : "—") },
            { label: "Expenses", align: "right", render: r => fmtFull(r.annualExpenses) },
            { label: "Liquid", align: "right", render: r => <span style={{ color: r.taxable < p.liquidityThreshold ? IEQ.danger : IEQ.textDark, fontWeight: 700 }}>{fmtFull(r.taxable)}</span> },
            { label: "Runway", align: "right", render: r => `${r.runwayMonths.toFixed(1)}m` },
            { label: "Wealth", align: "right", render: r => <span style={{ fontWeight: 700 }}>{fmtFull(r.wealth)}</span> },
          ]}
          data={rows}
        />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "Georgia, serif", color: IEQ.navy }}>Core Assumptions</div>
          {[
            ["Real return", `${(p.expectedReturn - p.inflationRate).toFixed(1)}%/yr`],
            ["General inflation", `${p.inflationRate}%/yr`],
            ["Healthcare inflation", p.useHealthcareInflation ? `${p.healthcareInflationRate}%/yr` : `${p.inflationRate}%/yr`],
            ["Salary growth", `${p.annualRaises}%/yr until retirement`],
            ["RMD rule", `Start age ${RMD_START_AGE}`],
            ["Effective tax rate", `${p.effectiveTaxRate}%`],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 5 ? `1px solid ${IEQ.borderLight}` : "none", fontSize: 12.5 }}>
              <span style={{ color: IEQ.textLight }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "Georgia, serif", color: IEQ.navy }}>Liquidity Governance</div>
          {[
            ["Current liquid capital", fmtFull(main.currentLiquid)],
            ["Liquidity floor", fmtFull(p.liquidityThreshold)],
            [`${p.liquidityReserveMonths}-month reserve`, fmtFull(main.reserveTargetStart)],
            ["Annual capital calls", fmtFull(p.annualCapitalCalls)],
            ["Annual distributions", fmtFull(p.annualDistributions)],
            ["Post-call liquidity", fmtFull(main.postCallLiquidity)],
            ["Stress runway", `${main.stressRunwayNow.toFixed(1)} months`],
            ["Minimum projected liquidity", fmtFull(main.minimumLiquidBalance)],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 7 ? `1px solid ${IEQ.borderLight}` : "none", fontSize: 12.5 }}>
              <span style={{ color: IEQ.textLight }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// PORTAL SHELL
// ============================================================
const NAV_ITEMS = [
  { key: "summary", label: "Executive Summary" },
  { key: "liquidity", label: "Liquidity" },
  { key: "advisor", label: "AI Advisor", accent: true },
  { key: "inputs", label: "Inputs" },
  { key: "scenarios", label: "Scenarios" },
  { key: "details", label: "Projection Detail" },
];

function PortalApp({ userEmail, onLock }) {
  const [page, setPage] = useState("summary");
  const [p, setP] = useState(defaultProfile);
  const upd = useCallback((key, val) => setP(prev => ({ ...prev, [key]: val })), []);

  const isCurrentlyWorking = (p.age || 70) < (p.retirementAge || 75);
  const yearsUntilRetirement = Math.max(0, (p.retirementAge || 75) - (p.age || 70));

  const main = useMemo(() => runProjection(p), [p]);

  const scenario = useMemo(() => {
    if (!p.scenarioEnabled) return null;
    const overrides = {};

    switch (p.scenarioType) {
      case "retireLater":
        overrides.retirementAge = p.scenarioRetireAge || 77;
        break;
      case "cutSpending": {
        const cut = p.scenarioCutAmount || 300;
        const varTotal = (p.dining || 0) + (p.entertainment || 0) + (p.travel || 0) + (p.miscellaneous || 0);
        if (varTotal > 0) {
          const ratio = Math.max(0, 1 - cut / varTotal);
          overrides.dining = Math.round((p.dining || 0) * ratio);
          overrides.entertainment = Math.round((p.entertainment || 0) * ratio);
          overrides.travel = Math.round((p.travel || 0) * ratio);
          overrides.miscellaneous = Math.round((p.miscellaneous || 0) * ratio);
        }
        break;
      }
      case "delaySS":
        overrides.ssStartAge = p.scenarioSSAge || 70;
        break;
      case "savingsBoost":
        overrides.savingsRatePercent = p.scenarioSavingsRate || 25;
        break;
      case "capitalCallShock":
        overrides.scenarioCapitalCallAmount = p.scenarioCapitalCallAmount || 150000;
        overrides.scenarioCapitalCallAge = p.scenarioCapitalCallAge || 74;
        break;
      case "recurringExpense":
        overrides.scenarioRecurringExpense = p.scenarioRecurringExpense || 500;
        overrides.scenarioRecurringExpenseStartAge = p.scenarioRecurringExpenseStartAge || 74;
        break;
      case "incomeDrop":
        overrides.scenarioIncomeDropPct = p.scenarioIncomeDropPct || 20;
        break;
      default:
        break;
    }

    return runProjection(p, overrides);
  }, [p]);

  const recs = useMemo(() => {
    const r = [];
    const m = main;

    if (m.isWorking) {
      const ytr = (p.retirementAge || 75) - (p.age || 70);
      r.push({ type: "good", text: `${ytr} working year${ytr > 1 ? "s" : ""} remaining. Projected assets at retirement: ${fmtFull(m.wealthAtRetirement)}.` });
      if ((p.savingsRatePercent || 0) < 15) {
        r.push({ type: "warning", text: `Savings rate of ${p.savingsRatePercent}% is below 15%. Increasing savings would improve retirement durability and liquidity resilience.` });
      }
    }

    if (m.withdrawalRate > 5) {
      r.push({ type: "danger", text: `Projected retirement withdrawal rate is ${m.withdrawalRate.toFixed(1)}%, above a conservative sustainability range.` });
    } else if (m.withdrawalRate > 4) {
      r.push({ type: "warning", text: `Projected withdrawal rate of ${m.withdrawalRate.toFixed(1)}% is slightly elevated.` });
    } else if (m.withdrawalRate > 0) {
      r.push({ type: "good", text: `Projected withdrawal rate of ${m.withdrawalRate.toFixed(1)}% is within a reasonable planning range.` });
    }

    if (m.depletionAge) {
      r.push({ type: "danger", text: `Total assets may be depleted by age ${m.depletionAge}.` });
    }

    if (m.liquidBreachAge) {
      r.push({ type: "warning", text: `Liquid assets may fall below your ${fmtFull(p.liquidityThreshold)} floor by age ${m.liquidBreachAge}${m.liquidRecoveryAge ? ` and recover by age ${m.liquidRecoveryAge}` : ""}.` });
    } else {
      r.push({ type: "good", text: `Liquid assets remain above the defined floor of ${fmtFull(p.liquidityThreshold)} in the base case.` });
    }

    if (m.stressRunwayNow < 12) {
      r.push({ type: "warning", text: `After annual capital calls, current stress runway is ${m.stressRunwayNow.toFixed(1)} months, below a full-year comfort range.` });
    }

    const rmdYear = main.projection.find(d => d.rmd > 0);
    if (rmdYear) {
      r.push({ type: "warning", text: `RMDs begin at age ${rmdYear.age} at approximately ${fmtFull(rmdYear.rmd)} per year.` });
    }

    if (scenario && scenario.wealthAtEnd > main.wealthAtEnd) {
      r.push({ type: "good", text: `The active scenario improves ending wealth by ${fmtFull(scenario.wealthAtEnd - main.wealthAtEnd)}.` });
    }

    if (r.length === 0) r.push({ type: "good", text: "Your plan is well-funded through the current planning horizon." });
    return r;
  }, [main, scenario, p]);

  const expenseBreakdown = useMemo(() => [
    { label: "Housing", value: p.housing || 0 },
    { label: "Health", value: p.healthcare || 0 },
    { label: "Insurance", value: p.insurance || 0 },
    { label: "Taxes", value: p.taxes || 0 },
    { label: "Utilities", value: p.utilities || 0 },
    { label: "Debt", value: p.debtPayments || 0 },
    { label: "Food", value: (p.groceries || 0) + (p.dining || 0) },
    { label: "Transport", value: p.transportation || 0 },
    { label: "Travel", value: p.travel || 0 },
    { label: "Fun", value: p.entertainment || 0 },
    { label: "Gifts", value: p.giftsCharity || 0 },
    { label: "Personal", value: p.personalCare || 0 },
    { label: "Misc", value: p.miscellaneous || 0 },
  ].filter(d => d.value > 0).sort((a, b) => b.value - a.value), [p]);

  const safetyScore = useMemo(() => {
    const wdSafe = main.withdrawalRate <= 4 ? 100 : main.withdrawalRate <= 6 ? 60 : 20;
    const fundSafe = main.fundedPct;
    const cushSafe = main.cushionMonths >= 60 ? 100 : main.cushionMonths >= 24 ? 70 : 30;
    const liqSafe = main.liquidBreachAge ? 35 : 100;
    return Math.round(wdSafe * 0.3 + fundSafe * 0.35 + cushSafe * 0.15 + liqSafe * 0.2);
  }, [main]);

  return (
    <div style={{
      "--c-bg": IEQ.offWhite,
      "--c-card": IEQ.white,
      "--c-text": IEQ.textDark,
      "--c-label": IEQ.textMid,
      "--c-hint": IEQ.textLight,
      "--c-border": IEQ.borderLight,
      "--c-input-bg": IEQ.offWhite,
      "--c-accent": IEQ.navy,
      "--c-accent-light": `${IEQ.navy}10`,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      minHeight: "100vh",
      background: IEQ.offWhite,
      color: IEQ.textDark,
      display: "flex",
    }}>
      {/* Sidebar */}
      <div style={{ width: 250, background: IEQ.navy, color: IEQ.white, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "26px 22px 22px", borderBottom: `1px solid ${IEQ.navyLight}` }}>
          <IEQLogo />
          <div style={{ fontSize: 11, color: IEQ.goldLight, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 14, fontFamily: "Georgia, serif" }}>Client Portal</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>{userEmail}</div>
        </div>

        <div style={{ padding: "18px 0", flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              style={{
                width: "100%",
                padding: "12px 22px",
                background: page === item.key ? `${IEQ.gold}16` : "transparent",
                border: "none",
                borderLeft: page === item.key ? `2px solid ${IEQ.gold}` : "2px solid transparent",
                color: page === item.key ? IEQ.goldLight : "rgba(255,255,255,0.62)",
                fontSize: 12.5,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "Georgia, serif",
                letterSpacing: 0.4,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {item.label}
              {item.accent && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 2, background: IEQ.gold, color: IEQ.navy, fontWeight: 700, letterSpacing: 1 }}>AI</span>}
            </button>
          ))}
        </div>

        <div style={{ padding: "16px 22px", borderTop: `1px solid ${IEQ.navyLight}` }}>
          <button onClick={onLock} style={{ width: "100%", padding: "10px 14px", borderRadius: 2, border: `1px solid ${IEQ.gold}40`, background: "transparent", color: IEQ.goldLight, cursor: "pointer", fontWeight: 700, fontFamily: "Georgia, serif" }}>
            Lock Portal
          </button>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", lineHeight: 1.6, marginTop: 12 }}>
            IEQ Capital LLC
            <br />
            <span style={{ color: IEQ.goldLight, opacity: 0.55 }}>The Pursuit of Investment Excellence</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "30px 34px", overflowY: "auto", maxHeight: "100vh" }}>
        {page === "summary" && (
          <ExecutiveSummaryPage
            p={p}
            main={main}
            scenario={scenario}
            recs={recs}
            expenseBreakdown={expenseBreakdown}
            safetyScore={safetyScore}
            isCurrentlyWorking={isCurrentlyWorking}
            yearsUntilRetirement={yearsUntilRetirement}
          />
        )}
        {page === "liquidity" && <LiquidityPage p={p} main={main} scenario={scenario} />}
        {page === "advisor" && <AIAdvisorPage p={p} main={main} scenario={scenario} />}
        {page === "inputs" && <InputsPage p={p} upd={upd} isCurrentlyWorking={isCurrentlyWorking} />}
        {page === "scenarios" && <ScenarioPage p={p} upd={upd} main={main} scenario={scenario} />}
        {page === "details" && <DetailsPage p={p} main={main} />}
      </div>
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [auth, setAuth] = useState({
    unlocked: false,
    email: "",
  });

  if (!auth.unlocked) {
    return <AccessGate onUnlock={(email) => setAuth({ unlocked: true, email })} />;
  }

  return <PortalApp userEmail={auth.email} onLock={() => setAuth({ unlocked: false, email: "" })} />;
}
