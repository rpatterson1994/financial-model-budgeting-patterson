import { useState, useMemo, useEffect, useCallback } from "react";

// ============================================================
// IEQ BRAND SYSTEM
// ============================================================
const IEQ = {
  navy: "#0F1D4A",
  navyLight: "#1A2D5E",
  navyMid: "#2A3F72",
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

// 2025 Federal tax brackets (simplified)
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

  // Employment
  monthlySalary: 8000,
  retirementAge: 75,
  annualRaises: 2.0,
  savingsRatePercent: 15,

  // Retirement Income
  socialSecurity: 3200,
  ssStartAge: 70,
  pension: 0,
  annuityIncome: 0,
  rentalIncome: 0,
  otherIncome: 0,

  // Assets — split pre-tax vs taxable
  liquidSavings: 250000,
  preTaxAccounts: 600000,
  taxableAccounts: 200000,
  expectedReturn: 5.0,
  inflationRate: 3.0,

  // Tax
  filingStatus: "married",
  effectiveTaxRate: 18,

  // Healthcare
  useHealthcareInflation: true,
  healthcareInflationRate: 5.5,

  // Fixed expenses
  housing: 2200,
  insurance: 600,
  utilities: 350,
  healthcare: 800,
  debtPayments: 0,
  taxes: 500,

  // Variable expenses
  groceries: 600,
  dining: 300,
  transportation: 400,
  entertainment: 200,
  travel: 500,
  giftsCharity: 300,
  personalCare: 150,
  miscellaneous: 200,

  // Existing one-time
  plannedLargeExpenses: 0,
  largeExpenseYear: 0,

  // NEW: Liquidity framework
  liquidityThreshold: 150000,
  annualCapitalCalls: 25000,
  annualDistributions: 10000,
  liquidityReserveMonths: 12,

  // NEW: Additional planning events
  homePurchaseAmount: 0,
  homePurchaseAge: 75,

  // Scenario
  scenarioEnabled: false,
  scenarioType: "retireLater", // retireLater | cutSpending | delaySS | savingsBoost | capitalCallShock | recurringExpense | incomeDrop
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
// PROJECTION ENGINE (pure function — reused for scenario)
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

  // Base monthly expenses (non-healthcare)
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

    // RMD calculation
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
      // Grow accounts
      preTax = preTax * (1 + realReturn);
      taxable = taxable * (1 + realReturn);

      // RMD: move from pre-tax to taxable
      if (rmdRequired > 0) {
        preTax -= rmdRequired;
      }

      // Salary savings
      if (working && salaryThisYear > 0) {
        const saved = salaryThisYear * savingsRate;
        preTax += saved * 0.7;
        taxable += saved * 0.3;
      }

      // Core yearly cash flow
      const netCashFlow = totalNetIncome - adjExpenses - capitalCallThisYear;
      taxable += netCashFlow;

      // Home purchase
      if ((cfg.homePurchaseAmount || 0) > 0 && thisAge === (cfg.homePurchaseAge || age + 1)) {
        taxable -= cfg.homePurchaseAmount;
      }

      // Existing large expense
      if ((cfg.plannedLargeExpenses || 0) > 0 && thisAge === age + (cfg.largeExpenseYear || 0)) {
        taxable -= cfg.plannedLargeExpenses;
      }

      // Draw from pre-tax if taxable goes negative
      if (taxable < 0) {
        preTax += taxable;
        taxable = 0;
      }
    }

    const totalWealth = preTax + taxable;
    const reserveTarget = totalMonthlyBase * (cfg.liquidityReserveMonths || 12) * inflMult;
    const liquidAboveReserve = taxable - reserveTarget;
    const annualBurn = Math.max(adjExpenses - totalNetIncome, 0);
    const runwayMonths = totalMonthlyBase > 0 ? taxable / (totalMonthlyBase) : 999;
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

    // Liquidity additions
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
// UI COMPONENTS
// ============================================================

function NumberInput({ label, value, onChange, prefix = "$", min = 0, max, hint }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--c-label)", fontWeight: 500, marginBottom: 4, letterSpacing: 0.2 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--c-hint)", marginLeft: 6, fontSize: 11.5 }}>{hint}</span>}
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--c-input-bg)",
          borderRadius: 4,
          border: focused ? "1px solid var(--c-accent)" : "1px solid var(--c-border)",
          padding: "0 12px",
          transition: "border .15s",
        }}
      >
        {prefix && <span style={{ color: "var(--c-hint)", fontWeight: 600, fontSize: 16, marginRight: 4, userSelect: "none" }}>{prefix}</span>}
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
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 17,
            fontFamily: "var(--font)",
            fontWeight: 600,
            color: "var(--c-text)",
            padding: "11px 0",
          }}
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
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 48,
          height: 26,
          borderRadius: 13,
          border: "none",
          cursor: "pointer",
          position: "relative",
          background: value ? "var(--c-accent)" : "var(--c-border)",
          transition: "background .2s",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: "#fff",
            position: "absolute",
            top: 3,
            left: value ? 25 : 3,
            transition: "left .2s",
            boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          }}
        />
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
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "var(--font)",
              transition: "all .15s",
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
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "16px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 16, fontWeight: 700, color: "var(--c-text)", fontFamily: "var(--font)" }}>
          {title}
          {badge && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 2, background: "var(--c-accent-light)", color: "var(--c-accent)" }}>{badge}</span>}
        </span>
        <span style={{ fontSize: 18, color: "var(--c-hint)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
      </button>
      {open && <div style={{ padding: "4px 20px 20px" }}>{children}</div>}
    </div>
  );
}

// ============================================================
// CHART COMPONENTS
// ============================================================

function MiniBar({ data, height = 200 }) {
  const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const bw = Math.min(32, (100 / data.length) * 0.7);
  return (
    <div style={{ position: "relative", height, width: "100%", marginTop: 8 }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: "var(--c-border)" }} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: "85%" }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: `${bw}%` }}>
            <div
              style={{
                width: "100%",
                maxWidth: 28,
                borderRadius: "2px 2px 0 0",
                height: `${Math.max((Math.abs(d.value) / maxVal) * 85, 2)}%`,
                background: d.highlight ? "var(--c-accent)" : "var(--c-bar)",
                opacity: 0.9,
                transition: "height .4s",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ fontSize: 10, color: "var(--c-hint)", textAlign: "center", width: `${bw}%` }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectionChart({ mainData, scenarioData, retirementAge, liquidityThreshold }) {
  if (!mainData || mainData.length === 0) return null;
  const allData = scenarioData
    ? [...mainData.map(d => d.wealth), ...scenarioData.map(d => d.wealth)]
    : mainData.map(d => d.wealth);

  const maxW = Math.max(...allData, 1);
  const minW = Math.min(...allData, 0);
  const range = maxW - minW || 1;
  const h = 300;
  const w = 620;
  const pad = { t: 22, r: 20, b: 40, l: 65 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const toPoints = (data) =>
    data.map((d, i) => {
      const x = pad.l + (i / (data.length - 1)) * cw;
      const y = pad.t + ((maxW - d.wealth) / range) * ch;
      return `${x},${y}`;
    });

  const mainPts = toPoints(mainData);
  const scenPts = scenarioData ? toPoints(scenarioData) : null;
  const areaPts = [...mainPts, `${pad.l + cw},${pad.t + ch}`, `${pad.l},${pad.t + ch}`];
  const retireIdx = mainData.findIndex(d => d.age === retirementAge);
  const depletionYear = mainData.find(d => d.wealth <= 0);
  const liquidityBreach = mainData.find(d => d.taxable < liquidityThreshold);

  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => ({
    val: maxW - (i / yTicks) * range,
    y: pad.t + (i / yTicks) * ch,
  }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {retireIdx > 0 && retireIdx < mainData.length && (
        <rect x={pad.l} y={pad.t} width={(retireIdx / (mainData.length - 1)) * cw} height={ch} fill="var(--c-accent)" opacity={0.03} rx={2} />
      )}

      {yLabels.map((yl, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={yl.y} y2={yl.y} stroke="var(--c-border)" strokeWidth={0.7} strokeDasharray={yl.val === 0 ? "0" : "4,4"} />
          <text x={pad.l - 8} y={yl.y + 4} textAnchor="end" fontSize={10} fill="var(--c-hint)" fontFamily="var(--font)">
            {fmt(yl.val)}
          </text>
        </g>
      ))}

      {minW < 0 && (
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + (maxW / range) * ch} y2={pad.t + (maxW / range) * ch} stroke="var(--c-danger)" strokeWidth={1.2} />
      )}

      {retireIdx > 0 && retireIdx < mainData.length && (() => {
        const rx = pad.l + (retireIdx / (mainData.length - 1)) * cw;
        return (
          <g>
            <line x1={rx} x2={rx} y1={pad.t} y2={pad.t + ch} stroke="var(--c-accent)" strokeWidth={1.1} strokeDasharray="6,4" opacity={0.8} />
            <text x={rx} y={pad.t - 5} textAnchor="middle" fontSize={9.5} fill="var(--c-accent)" fontWeight={600}>
              Retire
            </text>
          </g>
        );
      })()}

      {liquidityBreach && (() => {
        const bx = pad.l + (mainData.indexOf(liquidityBreach) / (mainData.length - 1)) * cw;
        return (
          <g>
            <line x1={bx} x2={bx} y1={pad.t} y2={pad.t + ch} stroke="var(--c-warning)" strokeWidth={1.1} strokeDasharray="4,4" opacity={0.9} />
            <text x={bx} y={h - 24} textAnchor="middle" fontSize={9.5} fill="var(--c-warning)" fontWeight={700}>
              Liquidity breach
            </text>
          </g>
        );
      })()}

      <polygon points={areaPts.join(" ")} fill="url(#aGrad)" opacity={0.28} />
      <polyline points={mainPts.join(" ")} fill="none" stroke="var(--c-accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {scenPts && (
        <polyline points={scenPts.join(" ")} fill="none" stroke="var(--c-scenario)" strokeWidth={2.2} strokeLinejoin="round" strokeDasharray="8,4" />
      )}

      {mainData
        .filter((_, i) => i % Math.max(1, Math.floor(mainData.length / 6)) === 0 || i === mainData.length - 1)
        .map(d => {
          const x = pad.l + (mainData.indexOf(d) / (mainData.length - 1)) * cw;
          return (
            <text key={d.age} x={x} y={h - 8} textAnchor="middle" fontSize={10} fill="var(--c-hint)" fontFamily="var(--font)">
              Age {d.age}
            </text>
          );
        })}

      {depletionYear && (() => {
        const dx = pad.l + (mainData.indexOf(depletionYear) / (mainData.length - 1)) * cw;
        return (
          <g>
            <line x1={dx} x2={dx} y1={pad.t} y2={pad.t + ch} stroke="var(--c-danger)" strokeWidth={1.5} strokeDasharray="6,4" />
            <text x={dx} y={pad.t - 4} textAnchor="middle" fontSize={10} fill="var(--c-danger)" fontWeight={700}>
              Funds depleted
            </text>
          </g>
        );
      })()}

      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.45} />
          <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Gauge({ value, label, danger, warning }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = danger ? "var(--c-danger)" : warning ? "var(--c-warning)" : "var(--c-safe)";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: 100, height: 54, margin: "0 auto", overflow: "hidden" }}>
        <svg viewBox="0 0 100 54" style={{ width: "100%", height: "100%" }}>
          <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke="var(--c-border)" strokeWidth={8} strokeLinecap="round" />
          <path
            d="M 8 50 A 42 42 0 0 1 92 50"
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 132} 132`}
            style={{ transition: "stroke-dasharray .6s" }}
          />
        </svg>
        <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, fontSize: 18, fontWeight: 800, color, fontFamily: "var(--font)" }}>
          {Math.round(value)}%
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--c-hint)", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
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
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 12px",
        borderRadius: 20,
        background: isWorking ? `${IEQ.navy}12` : `${IEQ.gold}18`,
        color: isWorking ? IEQ.navy : IEQ.gold,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {isWorking ? "Working" : "Retired"}
    </span>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function FinancialModel() {
  const [p, setP] = useState(defaultProfile);
  const [view, setView] = useState("dashboard");
  const upd = useCallback((key, val) => setP(prev => ({ ...prev, [key]: val })), []);

  const isCurrentlyWorking = (p.age || 70) < (p.retirementAge || 75);
  const yearsUntilRetirement = Math.max(0, (p.retirementAge || 75) - (p.age || 70));

  // Main projection
  const main = useMemo(() => runProjection(p), [p]);

  // Scenario projection
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

  // Recommendations
  const recs = useMemo(() => {
    const r = [];
    const m = main;

    if (m.isWorking) {
      const ytr = (p.retirementAge || 75) - (p.age || 70);
      r.push({ type: "good", text: `${ytr} working year${ytr > 1 ? "s" : ""} remaining. Projected assets at retirement: ${fmtFull(m.wealthAtRetirement)}.` });

      const sr = p.savingsRatePercent || 0;
      if (sr < 15) {
        r.push({ type: "warning", text: `Savings rate of ${sr}% is below 15%. Increasing savings would strengthen both retirement assets and current liquidity resilience.` });
      }
    }

    if (m.withdrawalRate > 5) {
      r.push({ type: "danger", text: `Projected retirement withdrawal rate is ${m.withdrawalRate.toFixed(1)}%, above a conservative sustainability range. Consider working longer, reducing spending, or building more taxable liquidity.` });
    } else if (m.withdrawalRate > 4) {
      r.push({ type: "warning", text: `Retirement withdrawal rate of ${m.withdrawalRate.toFixed(1)}% is slightly elevated. A modest adjustment would improve plan durability.` });
    } else if (m.withdrawalRate > 0) {
      r.push({ type: "good", text: `Projected withdrawal rate of ${m.withdrawalRate.toFixed(1)}% is within a reasonable planning range.` });
    }

    if (m.depletionAge) {
      r.push({ type: "danger", text: `Total assets may be depleted by age ${m.depletionAge}. Use the scenario section to test work-longer, spend-less, or save-more options.` });
    }

    if (m.liquidBreachAge) {
      r.push({
        type: "warning",
        text: `Liquid assets may fall below your ${fmtFull(p.liquidityThreshold)} liquidity floor by age ${m.liquidBreachAge}${m.liquidRecoveryAge ? ` and recover by age ${m.liquidRecoveryAge}` : " with no modeled recovery afterward"}.`,
      });
    } else {
      r.push({ type: "good", text: `Liquid assets remain above the defined liquidity floor of ${fmtFull(p.liquidityThreshold)} throughout the base projection.` });
    }

    if (m.stressRunwayNow < 12) {
      r.push({
        type: "warning",
        text: `After a normal year of capital calls, current liquid runway falls to ${m.stressRunwayNow.toFixed(1)} months. That is a tighter cushion than your ${p.liquidityReserveMonths}-month reserve target.`,
      });
    }

    const rmdYear = main.projection.find(d => d.rmd > 0);
    if (rmdYear) {
      r.push({ type: "warning", text: `Required Minimum Distributions begin at age ${rmdYear.age} (${fmtFull(rmdYear.rmd)}/year). This will increase taxable income and should be planned alongside liquidity needs.` });
    }

    const highBracket = main.projection.find(d => d.marginalBracket >= 32);
    if (highBracket) {
      r.push({ type: "warning", text: `Projected income at age ${highBracket.age} reaches the ${highBracket.marginalBracket}% marginal bracket. Consider tax-bracket management and timing of withdrawals.` });
    }

    if (p.useHealthcareInflation) {
      const hcAt90 = (p.healthcare || 0) * 12 * Math.pow((p.healthcareInflationRate || 5.5) / 100 + 1, Math.max(0, 90 - (p.age || 70)));
      const genAt90 = (p.healthcare || 0) * 12 * Math.pow((p.inflationRate || 3) / 100 + 1, Math.max(0, 90 - (p.age || 70)));
      if (hcAt90 > genAt90 * 1.3) {
        r.push({ type: "warning", text: `Healthcare at age 90 is projected at ${fmtFull(hcAt90)}/year using medical inflation, versus ${fmtFull(genAt90)} under general inflation. Healthcare remains a meaningful long-run cost risk.` });
      }
    }

    if (scenario && !scenario.depletionAge && main.depletionAge) {
      r.push({ type: "good", text: `The current scenario removes total fund depletion and ends with ${fmtFull(scenario.wealthAtEnd)} at age ${p.planToAge}.` });
    } else if (scenario && scenario.wealthAtEnd > main.wealthAtEnd) {
      const diff = scenario.wealthAtEnd - main.wealthAtEnd;
      r.push({ type: "good", text: `The current scenario improves ending wealth by ${fmtFull(diff)} at age ${p.planToAge}.` });
    }

    if (r.length === 0) {
      r.push({ type: "good", text: "Your plan is well-funded through the selected planning horizon." });
    }

    return r;
  }, [main, scenario, p]);

  // Expense breakdown
  const expenseBreakdown = useMemo(
    () =>
      [
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
      ]
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value),
    [p]
  );

  // Liquidity breakdown
  const liquidityBreakdown = useMemo(() => {
    const reserveGap = main.currentLiquid - main.reserveTargetStart;
    return [
      { label: "Current Liquid", value: main.currentLiquid, highlight: true },
      { label: "Reserve Target", value: main.reserveTargetStart },
      { label: "Annual Calls", value: p.annualCapitalCalls || 0 },
      { label: "Annual Distributions", value: p.annualDistributions || 0 },
      { label: "Excess Liquidity", value: Math.max(0, reserveGap) },
    ];
  }, [main, p]);

  // Safety score
  const safetyScore = useMemo(() => {
    const wdSafe = main.withdrawalRate <= 4 ? 100 : main.withdrawalRate <= 6 ? 60 : 20;
    const fundSafe = main.fundedPct;
    const cushSafe = main.cushionMonths >= 60 ? 100 : main.cushionMonths >= 24 ? 70 : 30;
    const liqSafe = main.liquidBreachAge ? 35 : 100;
    return Math.round(wdSafe * 0.3 + fundSafe * 0.35 + cushSafe * 0.15 + liqSafe * 0.2);
  }, [main]);

  const tabStyle = active => ({
    padding: "10px 20px",
    borderRadius: 2,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--c-accent)" : "transparent",
    color: active ? "#fff" : "var(--c-text)",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 0.4,
    fontFamily: "var(--font)",
    transition: "all .15s",
  });

  const statBox = (label, value, sub, accent) => (
    <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "16px 18px", border: "1px solid var(--c-border)", flex: "1 1 150px", minWidth: 150, boxShadow: "0 1px 3px rgba(15,29,74,0.03)" }}>
      <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, marginBottom: 3, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent || "var(--c-text)", fontFamily: "var(--font)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--c-hint)", marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const SCENARIO_OPTIONS = [
    { value: "retireLater", label: "Work Longer" },
    { value: "cutSpending", label: "Cut Spending" },
    { value: "delaySS", label: "Delay Social Security" },
    { value: "savingsBoost", label: "Save More" },
    { value: "capitalCallShock", label: "Capital Call Shock" },
    { value: "recurringExpense", label: "Recurring Expense Shock" },
    { value: "incomeDrop", label: "Income Reduction" },
  ];

  return (
    <div
      style={{
        "--c-bg": IEQ.offWhite,
        "--c-card": IEQ.white,
        "--c-text": IEQ.textDark,
        "--c-label": IEQ.textMid,
        "--c-hint": IEQ.textLight,
        "--c-border": IEQ.borderLight,
        "--c-input-bg": IEQ.offWhite,
        "--c-accent": IEQ.navy,
        "--c-accent-light": `${IEQ.navy}10`,
        "--c-bar": IEQ.gold,
        "--c-danger": IEQ.danger,
        "--c-warning": IEQ.warning,
        "--c-safe": IEQ.success,
        "--c-scenario": IEQ.navyMid,
        "--font": "'Georgia', serif",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: "var(--c-bg)",
        color: "var(--c-text)",
        minHeight: "100vh",
        padding: "0 0 40px",
      }}
    >
      {/* Header */}
      <div style={{ background: "var(--c-accent)", padding: "24px 28px 20px", color: "#fff", borderRadius: "0 0 4px 4px" }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.75, fontWeight: 600 }}>IEQ Capital</div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, fontFamily: "var(--font)" }}>Client Financial Planning Portal</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <PhasePill isWorking={isCurrentlyWorking} />
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            {isCurrentlyWorking ? `${yearsUntilRetirement}yr to retirement · ` : ""}Plan to age {p.planToAge}
          </span>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 6, padding: "16px 20px 8px", flexWrap: "wrap", maxWidth: 980, margin: "0 auto" }}>
        {[["dashboard", "Executive Summary"], ["inputs", "Inputs"], ["whatif", "Scenarios"], ["details", "Projection Detail"]].map(([k, l]) => (
          <button key={k} style={tabStyle(view === k)} onClick={() => setView(k)}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding: "8px 20px 0", maxWidth: 980, margin: "0 auto" }}>
        {/* ===================== DASHBOARD ===================== */}
        {view === "dashboard" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "12px 0 20px", flexWrap: "wrap" }}>
              {safetyScore >= 75 ? <StatusBadge status="good" label="Plan On Track" /> : safetyScore >= 45 ? <StatusBadge status="warning" label="Needs Attention" /> : <StatusBadge status="danger" label="Action Required" />}
              <span style={{ fontSize: 13, color: "var(--c-hint)" }}>
                Safety Score: <strong style={{ color: "var(--c-text)" }}>{safetyScore}/100</strong>
              </span>
            </div>

            {/* Primary KPI row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              {statBox("Monthly Net Income", fmtFull(main.currentMonthlyNet), isCurrentlyWorking ? `${fmtFull(main.currentMonthlyGross)} gross · ${p.effectiveTaxRate}% tax` : `After ${p.effectiveTaxRate}% tax`)}
              {statBox("Monthly Spending", fmtFull(main.totalMonthlyBase), `${fmtFull(main.fixedMonthly)} fixed + ${fmtFull(main.variableMonthly)} variable`)}
              {statBox("Monthly Surplus / Gap", fmtFull(main.monthlyGap), main.monthlyGap >= 0 ? "Income covers expenses" : "Shortfall funded from assets", main.monthlyGap >= 0 ? "var(--c-safe)" : "var(--c-danger)")}
              {statBox("Total Assets", fmtFull(main.totalAssets), `${fmtFull(main.preTaxStart)} pre-tax · ${fmtFull(main.totalAssets - main.preTaxStart)} liquid/taxable`)}
            </div>

            {/* Liquidity row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              {statBox("Current Liquid", fmtFull(main.currentLiquid), `Liquidity ratio ${(main.liquidityRatio * 100).toFixed(1)}%`, main.currentLiquid >= p.liquidityThreshold ? "var(--c-safe)" : "var(--c-danger)")}
              {statBox("Liquidity Floor", fmtFull(p.liquidityThreshold), main.liquidBreachAge ? `Breach age ${main.liquidBreachAge}` : "No projected breach", main.liquidBreachAge ? "var(--c-warning)" : "var(--c-text)")}
              {statBox("Runway", `${main.cushionMonths.toFixed(1)} mo`, `Reserve target ${fmtFull(main.reserveTargetStart)}`, main.cushionMonths >= p.liquidityReserveMonths ? "var(--c-safe)" : "var(--c-warning)")}
              {statBox("Stress Runway", `${main.stressRunwayNow.toFixed(1)} mo`, `After ${fmtFull(main.annualCapitalCalls)} annual calls`, main.stressRunwayNow >= p.liquidityReserveMonths ? "var(--c-safe)" : "var(--c-danger)")}
              {statBox("Annual Calls / Dist.", `${fmtFull(p.annualCapitalCalls)} / ${fmtFull(p.annualDistributions)}`, `Net ${fmtFull((p.annualDistributions || 0) - (p.annualCapitalCalls || 0))}`, (p.annualDistributions || 0) >= (p.annualCapitalCalls || 0) ? "var(--c-safe)" : "var(--c-warning)")}
            </div>

            {/* Tax + liquidity governance row */}
            {(() => {
              const firstRMD = main.projection.find(d => d.rmd > 0);
              const currentBracket = main.projection[0]?.marginalBracket || 0;
              return (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <div style={{ flex: "1 1 180px", background: "var(--c-card)", borderRadius: 4, padding: "14px 18px", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.1 }}>Marginal Tax Bracket</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: currentBracket >= 32 ? "var(--c-danger)" : "var(--c-text)", fontFamily: "var(--font)" }}>{currentBracket}%</div>
                    <div style={{ fontSize: 11, color: "var(--c-hint)" }}>{p.filingStatus === "married" ? "Married Filing Jointly" : "Single"}</div>
                  </div>
                  <div style={{ flex: "1 1 180px", background: "var(--c-card)", borderRadius: 4, padding: "14px 18px", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.1 }}>{firstRMD ? "Next RMD" : "RMDs"}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font)" }}>{firstRMD ? fmtFull(firstRMD.rmd) : "N/A"}</div>
                    <div style={{ fontSize: 11, color: "var(--c-hint)" }}>{firstRMD ? `Age ${firstRMD.age} · taxable` : p.age >= RMD_START_AGE ? "No pre-tax balance" : `Starts age ${RMD_START_AGE}`}</div>
                  </div>
                  <div style={{ flex: "1 1 180px", background: "var(--c-card)", borderRadius: 4, padding: "14px 18px", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.1 }}>Withdrawal Rate</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: main.withdrawalRate > 5 ? "var(--c-danger)" : main.withdrawalRate > 4 ? "var(--c-warning)" : "var(--c-safe)", fontFamily: "var(--font)" }}>{main.withdrawalRate.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: "var(--c-hint)" }}>{isCurrentlyWorking ? "Projected at retirement" : "Current rate"}</div>
                  </div>
                  <div style={{ flex: "1 1 180px", background: "var(--c-card)", borderRadius: 4, padding: "14px 18px", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.1 }}>Excess Liquidity</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: main.currentLiquid >= main.reserveTargetStart ? "var(--c-safe)" : "var(--c-warning)", fontFamily: "var(--font)" }}>{fmtFull(main.currentLiquid - main.reserveTargetStart)}</div>
                    <div style={{ fontSize: 11, color: "var(--c-hint)" }}>{p.liquidityReserveMonths}-month reserve policy</div>
                  </div>
                </div>
              );
            })()}

            {/* Gauges */}
            <div style={{ display: "flex", gap: 20, justifyContent: "center", margin: "16px 0", background: "var(--c-card)", borderRadius: 4, padding: "20px 16px", border: "1px solid var(--c-border)", flexWrap: "wrap" }}>
              <Gauge value={main.fundedPct} label="Years Funded" danger={main.fundedPct < 50} warning={main.fundedPct < 80} />
              <Gauge value={Math.min(100, (4 / Math.max(main.withdrawalRate, 0.1)) * 100)} label="Withdrawal Safety" danger={main.withdrawalRate > 6} warning={main.withdrawalRate > 4} />
              <Gauge value={Math.min(100, (main.cushionMonths / Math.max(1, p.liquidityReserveMonths)) * 100)} label="Liquidity Runway" danger={main.cushionMonths < 6} warning={main.cushionMonths < p.liquidityReserveMonths} />
              <Gauge value={Math.min(100, main.reserveCoverage * 100)} label="Reserve Coverage" danger={main.reserveCoverage < 0.75} warning={main.reserveCoverage < 1} />
            </div>

            {/* Projection */}
            <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "20px", border: "1px solid var(--c-border)", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font)", color: IEQ.navy }}>Wealth Projection to Age {p.planToAge}</div>
                {scenario && (
                  <div style={{ display: "flex", gap: 12, fontSize: 11, alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 16, height: 3, background: "var(--c-accent)", display: "inline-block" }} />
                      Current
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 16, height: 3, background: "var(--c-scenario)", display: "inline-block" }} />
                      Scenario
                    </span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--c-hint)", marginBottom: 8 }}>
                {main.depletionAge ? `Funds may run out at age ${main.depletionAge}` : `Ending assets: ${fmtFull(main.wealthAtEnd)}`}
                {scenario && ` · Scenario ending assets: ${fmtFull(scenario.wealthAtEnd)}`}
              </div>
              <ProjectionChart mainData={main.projection} scenarioData={scenario?.projection} retirementAge={p.retirementAge} liquidityThreshold={p.liquidityThreshold} />
            </div>

            {/* Two-column dashboard depth */}
            <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "20px", border: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, fontFamily: "var(--font)", color: IEQ.navy }}>Monthly Spending Mix</div>
                {p.useHealthcareInflation && <div style={{ fontSize: 11, color: "var(--c-warning)", marginBottom: 4 }}>Healthcare inflates at {p.healthcareInflationRate}% vs {p.inflationRate}% general</div>}
                <MiniBar data={expenseBreakdown.map((d, i) => ({ ...d, highlight: i < 3 }))} height={170} />
              </div>

              <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "20px", border: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, fontFamily: "var(--font)", color: IEQ.navy }}>Liquidity Framework</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: "var(--c-hint)" }}>Current liquid capital</span>
                    <strong>{fmtFull(main.currentLiquid)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: "var(--c-hint)" }}>Reserve target</span>
                    <strong>{fmtFull(main.reserveTargetStart)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: "var(--c-hint)" }}>Liquidity floor</span>
                    <strong>{fmtFull(p.liquidityThreshold)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: "var(--c-hint)" }}>Annual capital calls</span>
                    <strong style={{ color: "var(--c-warning)" }}>{fmtFull(p.annualCapitalCalls)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: "var(--c-hint)" }}>Annual distributions</span>
                    <strong style={{ color: "var(--c-safe)" }}>{fmtFull(p.annualDistributions)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: "var(--c-hint)" }}>Post-call liquidity</span>
                    <strong style={{ color: main.postCallLiquidity >= p.liquidityThreshold ? "var(--c-safe)" : "var(--c-danger)" }}>{fmtFull(main.postCallLiquidity)}</strong>
                  </div>
                </div>
                <MiniBar data={liquidityBreakdown} height={120} />
              </div>
            </div>

            {/* Recommendations */}
            <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "20px", border: "1px solid var(--c-border)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "var(--font)", color: IEQ.navy }}>Advisory Observations</div>
              {recs.map((r, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 2,
                    marginBottom: 8,
                    background: r.type === "danger" ? IEQ.dangerBg : r.type === "warning" ? IEQ.warningBg : IEQ.successBg,
                    borderLeft: `3px solid ${r.type === "danger" ? IEQ.danger : r.type === "warning" ? IEQ.warning : IEQ.success}`,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  {r.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================== INPUTS ===================== */}
        {view === "inputs" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--c-hint)", margin: "8px 0 16px", lineHeight: 1.5 }}>
              All amounts are <strong>monthly</strong> unless noted. Changes update the dashboard instantly.
            </div>

            <Section title="About You" icon="Profile">
              <NumberInput label="Current Age" value={p.age} onChange={v => upd("age", v)} prefix="" hint="years" />
              <NumberInput label="Plan Through Age" value={p.planToAge} onChange={v => upd("planToAge", v)} prefix="" hint="how long to plan for" />
            </Section>

            <Section title="Employment & Salary" icon="Work" badge={isCurrentlyWorking ? "Active" : "Retired"}>
              <NumberInput label="Monthly Salary" value={p.monthlySalary} onChange={v => upd("monthlySalary", v)} hint="gross monthly income while working" />
              <NumberInput label="Planned Retirement Age" value={p.retirementAge} onChange={v => upd("retirementAge", v)} prefix="" hint="when salary stops" />
              <PercentInput label="Annual Raise Assumption" value={p.annualRaises} onChange={v => upd("annualRaises", v)} hint="typical 2–3%" />
              <PercentInput label="Savings Rate (% of Salary)" value={p.savingsRatePercent} onChange={v => upd("savingsRatePercent", v)} hint="new contributions each year" />
            </Section>

            <Section title="Retirement Income" icon="Income">
              <NumberInput label="Social Security (Monthly)" value={p.socialSecurity} onChange={v => upd("socialSecurity", v)} />
              <NumberInput label="Social Security Start Age" value={p.ssStartAge} onChange={v => upd("ssStartAge", v)} prefix="" hint="62, FRA, or 70" />
              <NumberInput label="Pension" value={p.pension} onChange={v => upd("pension", v)} />
              <NumberInput label="Annuity Income" value={p.annuityIncome} onChange={v => upd("annuityIncome", v)} />
              <NumberInput label="Rental Income" value={p.rentalIncome} onChange={v => upd("rentalIncome", v)} />
              <NumberInput label="Other Income" value={p.otherIncome} onChange={v => upd("otherIncome", v)} hint="other recurring retirement cash flows" />
            </Section>

            <Section title="Savings & Investments" icon="Assets">
              <NumberInput label="Liquid Savings" value={p.liquidSavings} onChange={v => upd("liquidSavings", v)} hint="bank / money market cash" />
              <NumberInput label="Pre-Tax Accounts (IRA, 401k)" value={p.preTaxAccounts} onChange={v => upd("preTaxAccounts", v)} hint="subject to RMDs" />
              <NumberInput label="Taxable Accounts (Brokerage)" value={p.taxableAccounts} onChange={v => upd("taxableAccounts", v)} hint="treated as liquid/taxable capital" />
              <PercentInput label="Expected Annual Return" value={p.expectedReturn} onChange={v => upd("expectedReturn", v)} hint="before inflation" />
              <PercentInput label="Expected Inflation" value={p.inflationRate} onChange={v => upd("inflationRate", v)} hint="typically 2.5–3.5%" />
            </Section>

            <Section title="Liquidity Framework" icon="Liquidity" defaultOpen={false}>
              <NumberInput label="Liquidity Floor" value={p.liquidityThreshold} onChange={v => upd("liquidityThreshold", v)} hint="minimum liquid capital target" />
              <NumberInput label="Reserve Policy (Months)" value={p.liquidityReserveMonths} onChange={v => upd("liquidityReserveMonths", v)} prefix="" hint="target cash reserve in months of spending" />
              <NumberInput label="Annual Capital Calls" value={p.annualCapitalCalls} onChange={v => upd("annualCapitalCalls", v)} hint="expected annual commitment funding" />
              <NumberInput label="Annual Distributions" value={p.annualDistributions} onChange={v => upd("annualDistributions", v)} hint="expected annual private investment distributions" />
            </Section>

            <Section title="Tax Settings" icon="Tax" defaultOpen={false}>
              <SelectInput
                label="Filing Status"
                value={p.filingStatus}
                onChange={v => upd("filingStatus", v)}
                options={[
                  { value: "single", label: "Single" },
                  { value: "married", label: "Married Filing Jointly" },
                ]}
              />
              <PercentInput label="Estimated Effective Tax Rate" value={p.effectiveTaxRate} onChange={v => upd("effectiveTaxRate", v)} hint="federal + state combined" />
              <div style={{ padding: "10px 14px", borderRadius: 2, background: "var(--c-accent-light)", fontSize: 12.5, color: "var(--c-accent)", lineHeight: 1.5 }}>
                RMDs are auto-calculated from pre-tax accounts starting at age {RMD_START_AGE} using the IRS Uniform Lifetime Table.
              </div>
            </Section>

            <Section title="Healthcare" icon="Healthcare" defaultOpen={false}>
              <NumberInput label="Monthly Healthcare Cost" value={p.healthcare} onChange={v => upd("healthcare", v)} hint="premiums, prescriptions, copays" />
              <Toggle
                label="Use Higher Healthcare Inflation"
                value={p.useHealthcareInflation}
                onChange={v => upd("useHealthcareInflation", v)}
                hint={`Healthcare typically inflates faster than general costs (${p.healthcareInflationRate}% vs ${p.inflationRate}%)`}
              />
              {p.useHealthcareInflation && <PercentInput label="Healthcare Inflation Rate" value={p.healthcareInflationRate} onChange={v => upd("healthcareInflationRate", v)} hint="typically 5–6%" />}
            </Section>

            <Section title="Fixed Monthly Expenses" icon="Fixed" defaultOpen={false}>
              <NumberInput label="Housing" value={p.housing} onChange={v => upd("housing", v)} hint="mortgage, rent, HOA" />
              <NumberInput label="Insurance" value={p.insurance} onChange={v => upd("insurance", v)} hint="home, auto, life, umbrella" />
              <NumberInput label="Utilities" value={p.utilities} onChange={v => upd("utilities", v)} hint="electric, water, internet, phone" />
              <NumberInput label="Debt Payments" value={p.debtPayments} onChange={v => upd("debtPayments", v)} hint="auto loan, cards" />
              <NumberInput label="Taxes (Non-Income)" value={p.taxes} onChange={v => upd("taxes", v)} hint="property tax, estimated payments" />
            </Section>

            <Section title="Variable Monthly Expenses" icon="Variable" defaultOpen={false}>
              <NumberInput label="Groceries" value={p.groceries} onChange={v => upd("groceries", v)} />
              <NumberInput label="Dining Out" value={p.dining} onChange={v => upd("dining", v)} />
              <NumberInput label="Transportation" value={p.transportation} onChange={v => upd("transportation", v)} hint="gas, maintenance, rideshare" />
              <NumberInput label="Entertainment" value={p.entertainment} onChange={v => upd("entertainment", v)} />
              <NumberInput label="Travel" value={p.travel} onChange={v => upd("travel", v)} />
              <NumberInput label="Gifts & Charity" value={p.giftsCharity} onChange={v => upd("giftsCharity", v)} />
              <NumberInput label="Personal Care" value={p.personalCare} onChange={v => upd("personalCare", v)} />
              <NumberInput label="Miscellaneous" value={p.miscellaneous} onChange={v => upd("miscellaneous", v)} />
            </Section>

            <Section title="Planned Large Expenses" icon="Events" defaultOpen={false}>
              <NumberInput label="Large Expense Amount" value={p.plannedLargeExpenses} onChange={v => upd("plannedLargeExpenses", v)} hint="one-time major expense" />
              <NumberInput label="Years From Now" value={p.largeExpenseYear} onChange={v => upd("largeExpenseYear", v)} prefix="" hint="when that expense occurs" />
              <NumberInput label="Home Purchase Amount" value={p.homePurchaseAmount} onChange={v => upd("homePurchaseAmount", v)} hint="optional major purchase" />
              <NumberInput label="Home Purchase Age" value={p.homePurchaseAge} onChange={v => upd("homePurchaseAge", v)} prefix="" hint="age at purchase" />
            </Section>

            <button
              onClick={() => setView("dashboard")}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 2,
                border: "none",
                background: "var(--c-accent)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font)",
                marginTop: 8,
              }}
            >
              View Executive Summary
            </button>
          </div>
        )}

        {/* ===================== WHAT IF ===================== */}
        {view === "whatif" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--c-hint)", margin: "8px 0 16px", lineHeight: 1.5 }}>
              Compare your current plan against a single change. The dashed line on the chart represents the scenario case.
            </div>

            <Toggle label="Enable Scenario" value={p.scenarioEnabled} onChange={v => upd("scenarioEnabled", v)} hint="Turn on to compare a single scenario against the base plan" />

            {p.scenarioEnabled && (
              <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "20px", border: "1px solid var(--c-border)", marginBottom: 16 }}>
                <SelectInput label="Scenario Type" value={p.scenarioType} onChange={v => upd("scenarioType", v)} options={SCENARIO_OPTIONS} />

                {p.scenarioType === "retireLater" && (
                  <NumberInput label="Retire at Age" value={p.scenarioRetireAge} onChange={v => upd("scenarioRetireAge", v)} prefix="" hint={`Currently ${p.retirementAge}`} />
                )}

                {p.scenarioType === "cutSpending" && (
                  <NumberInput label="Cut Variable Spending By ($/month)" value={p.scenarioCutAmount} onChange={v => upd("scenarioCutAmount", v)} hint="applied across discretionary categories" />
                )}

                {p.scenarioType === "delaySS" && (
                  <NumberInput label="Start Social Security at Age" value={p.scenarioSSAge} onChange={v => upd("scenarioSSAge", v)} prefix="" hint={`Currently ${p.ssStartAge}`} />
                )}

                {p.scenarioType === "savingsBoost" && (
                  <PercentInput label="New Savings Rate" value={p.scenarioSavingsRate} onChange={v => upd("scenarioSavingsRate", v)} hint={`Currently ${p.savingsRatePercent}%`} />
                )}

                {p.scenarioType === "capitalCallShock" && (
                  <>
                    <NumberInput label="Additional Capital Call" value={p.scenarioCapitalCallAmount} onChange={v => upd("scenarioCapitalCallAmount", v)} hint="one-time extra call" />
                    <NumberInput label="Capital Call Age" value={p.scenarioCapitalCallAge} onChange={v => upd("scenarioCapitalCallAge", v)} prefix="" hint="age when shock occurs" />
                  </>
                )}

                {p.scenarioType === "recurringExpense" && (
                  <>
                    <NumberInput label="Additional Recurring Expense ($/month)" value={p.scenarioRecurringExpense} onChange={v => upd("scenarioRecurringExpense", v)} hint="ongoing monthly spend increase" />
                    <NumberInput label="Start Age" value={p.scenarioRecurringExpenseStartAge} onChange={v => upd("scenarioRecurringExpenseStartAge", v)} prefix="" hint="when new recurring spend begins" />
                  </>
                )}

                {p.scenarioType === "incomeDrop" && (
                  <PercentInput label="Income Reduction (%)" value={p.scenarioIncomeDropPct} onChange={v => upd("scenarioIncomeDropPct", v)} hint="temporary permanent reduction while working" />
                )}

                {scenario && (
                  <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ background: IEQ.offWhite, borderRadius: 2, padding: 14 }}>
                      <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.1 }}>Current Plan</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>Ending assets: <strong>{fmtFull(main.wealthAtEnd)}</strong></div>
                      <div style={{ fontSize: 12 }}>Liquid minimum: <strong>{fmtFull(main.minimumLiquidBalance)}</strong></div>
                      <div style={{ fontSize: 12 }}>Withdrawal rate: <strong>{main.withdrawalRate.toFixed(1)}%</strong></div>
                      <div style={{ fontSize: 12 }}>Liquidity breach: <strong>{main.liquidBreachAge ? `Age ${main.liquidBreachAge}` : "None"}</strong></div>
                      {main.depletionAge && <div style={{ fontSize: 12, color: "var(--c-danger)", fontWeight: 700 }}>Total depletion at age {main.depletionAge}</div>}
                    </div>

                    <div style={{ background: `${IEQ.navy}08`, borderRadius: 2, padding: 14 }}>
                      <div style={{ fontSize: 10, color: "var(--c-scenario)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.1 }}>Scenario</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>Ending assets: <strong style={{ color: scenario.wealthAtEnd > main.wealthAtEnd ? "var(--c-safe)" : "var(--c-danger)" }}>{fmtFull(scenario.wealthAtEnd)}</strong></div>
                      <div style={{ fontSize: 12 }}>Liquid minimum: <strong>{fmtFull(scenario.minimumLiquidBalance)}</strong></div>
                      <div style={{ fontSize: 12 }}>Withdrawal rate: <strong>{scenario.withdrawalRate.toFixed(1)}%</strong></div>
                      <div style={{ fontSize: 12 }}>Liquidity breach: <strong>{scenario.liquidBreachAge ? `Age ${scenario.liquidBreachAge}` : "None"}</strong></div>
                      <div style={{ fontSize: 12, marginTop: 6, fontWeight: 700, color: scenario.wealthAtEnd > main.wealthAtEnd ? "var(--c-safe)" : "var(--c-danger)" }}>
                        Ending difference: {fmtFull(scenario.wealthAtEnd - main.wealthAtEnd)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setView("dashboard")}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 2,
                border: "none",
                background: "var(--c-accent)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font)",
                marginTop: 8,
              }}
            >
              Return to Executive Summary
            </button>
          </div>
        )}

        {/* ===================== DETAILS ===================== */}
        {view === "details" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--c-hint)", margin: "8px 0 16px" }}>
              Year-by-year projection with liquidity, taxes, RMDs, inflation, and private-capital cash flow effects.
            </div>

            <div style={{ background: "var(--c-card)", borderRadius: 4, border: "1px solid var(--c-border)", overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font)", color: IEQ.navy }}>Annual Projection Summary</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: IEQ.cream }}>
                      {["Age", "Phase", "Income", "RMD", "Calls", "Dist.", "Expenses", "Liquid", "Reserve", "Runway", "Wealth"].map(h => (
                        <th key={h} style={{ padding: "10px 8px", textAlign: h === "Phase" ? "left" : "right", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1.0, color: IEQ.navy, whiteSpace: "nowrap", borderBottom: `2px solid ${IEQ.gold}`, fontFamily: "var(--font)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {main.projection
                      .filter((_, i) => i % (main.projection.length > 20 ? Math.ceil(main.projection.length / 18) : 1) === 0 || _ === main.projection[main.projection.length - 1])
                      .map((d, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--c-border)", background: d.wealth < 0 ? IEQ.dangerBg : d.taxable < p.liquidityThreshold ? IEQ.warningBg : "transparent" }}>
                          <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700 }}>{d.age}</td>
                          <td style={{ padding: "9px 8px", textAlign: "left" }}>
                            <span style={{ padding: "2px 7px", borderRadius: 2, background: d.phase === "working" ? `${IEQ.navy}12` : `${IEQ.gold}22`, color: d.phase === "working" ? IEQ.navy : IEQ.gold, fontWeight: 600, fontSize: 10.5 }}>
                              {d.phase === "working" ? "Work" : "Ret"}
                            </span>
                          </td>
                          <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmtFull(d.annualIncome)}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", color: d.rmd > 0 ? "var(--c-warning)" : "var(--c-hint)" }}>{d.rmd > 0 ? fmtFull(d.rmd) : "—"}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", color: d.capitalCalls > 0 ? "var(--c-warning)" : "var(--c-hint)" }}>{d.capitalCalls > 0 ? fmtFull(d.capitalCalls) : "—"}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", color: d.distributions > 0 ? "var(--c-safe)" : "var(--c-hint)" }}>{d.distributions > 0 ? fmtFull(d.distributions) : "—"}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmtFull(d.annualExpenses)}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", color: d.taxable < p.liquidityThreshold ? "var(--c-danger)" : "var(--c-text)", fontWeight: 700 }}>{fmtFull(d.taxable)}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", color: "var(--c-hint)" }}>{fmtFull(d.reserveTarget)}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", color: d.runwayMonths < p.liquidityReserveMonths ? "var(--c-warning)" : "var(--c-text)" }}>{d.runwayMonths.toFixed(1)}m</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, color: d.wealth < 0 ? "var(--c-danger)" : "var(--c-text)" }}>{fmtFull(d.wealth)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "20px", border: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "var(--font)", color: IEQ.navy }}>Core Assumptions</div>
                {[
                  ["Real return (after inflation)", `${(p.expectedReturn - p.inflationRate).toFixed(1)}%/yr`],
                  ["General inflation", `${p.inflationRate}%/yr`],
                  ["Healthcare inflation", p.useHealthcareInflation ? `${p.healthcareInflationRate}%/yr` : `${p.inflationRate}%/yr (same as general)`],
                  ["Salary growth", `${p.annualRaises}%/yr until retirement`],
                  ["Salary savings split", "70% pre-tax / 30% taxable"],
                  ["RMDs", `Auto-calculated from age ${RMD_START_AGE}`],
                  ["Tax model", `${p.effectiveTaxRate}% effective rate on gross income`],
                  ["Retirement income", "Fixed (not inflation-adjusted)"],
                  ["Expenses", "Grow with inflation annually"],
                ].map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 8 ? "1px solid var(--c-border)" : "none", fontSize: 12.5, gap: 12 }}>
                    <span style={{ color: "var(--c-hint)" }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--c-card)", borderRadius: 4, padding: "20px", border: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, fontFamily: "var(--font)", color: IEQ.navy }}>Liquidity Governance</div>
                {[
                  ["Current liquid capital", fmtFull(main.currentLiquid)],
                  ["Liquidity floor", fmtFull(p.liquidityThreshold)],
                  [`${p.liquidityReserveMonths}-month reserve target`, fmtFull(main.reserveTargetStart)],
                  ["Annual capital calls", fmtFull(p.annualCapitalCalls)],
                  ["Annual distributions", fmtFull(p.annualDistributions)],
                  ["Post-call liquidity now", fmtFull(main.postCallLiquidity)],
                  ["Stress runway now", `${main.stressRunwayNow.toFixed(1)} months`],
                  ["Projected minimum liquid balance", fmtFull(main.minimumLiquidBalance)],
                  ["Liquid breach / recovery", main.liquidBreachAge ? `Age ${main.liquidBreachAge}${main.liquidRecoveryAge ? ` / ${main.liquidRecoveryAge}` : " / none"}` : "No breach projected"],
                ].map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 8 ? "1px solid var(--c-border)" : "none", fontSize: 12.5, gap: 12 }}>
                    <span style={{ color: "var(--c-hint)" }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: "var(--c-hint)", textAlign: "center", lineHeight: 1.6, padding: "8px 0 20px" }}>
              This model is for planning purposes only and does not constitute financial, tax, or legal advice.<br />
              Consult a qualified advisor before making major financial decisions.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
