import { useState, useMemo, useEffect, useCallback } from "react";

// ============================================================
// DATA: IRS Uniform Lifetime Table (age → divisor)
// ============================================================
const RMD_TABLE = {
  72:27.4,73:26.5,74:25.5,75:24.6,76:23.7,77:22.9,78:22.0,79:21.1,80:20.2,
  81:19.4,82:18.5,83:17.7,84:16.8,85:16.0,86:15.2,87:14.4,88:13.7,89:12.9,
  90:12.2,91:11.5,92:10.8,93:10.1,94:9.5,95:8.9,96:8.4,97:7.8,98:7.3,99:6.8,
  100:6.4,101:6.0,102:5.6,103:5.2,104:4.9,105:4.6,106:4.3,107:4.1,108:3.9,
  109:3.7,110:3.5,111:3.4,112:3.3,113:3.1,114:3.0,115:2.9,116:2.8,117:2.7,
  118:2.5,119:2.3,120:2.0,
};
const RMD_START_AGE = 73;

// 2024 Federal tax brackets (simplified)
const TAX_BRACKETS = {
  single: [
    { min: 0, max: 11600, rate: 10 },
    { min: 11600, max: 47150, rate: 12 },
    { min: 47150, max: 100525, rate: 22 },
    { min: 100525, max: 191950, rate: 24 },
    { min: 191950, max: 243725, rate: 32 },
    { min: 243725, max: 609350, rate: 35 },
    { min: 609350, max: Infinity, rate: 37 },
  ],
  married: [
    { min: 0, max: 23200, rate: 10 },
    { min: 23200, max: 94300, rate: 12 },
    { min: 94300, max: 201050, rate: 22 },
    { min: 201050, max: 383900, rate: 24 },
    { min: 383900, max: 487450, rate: 32 },
    { min: 487450, max: 731200, rate: 35 },
    { min: 731200, max: Infinity, rate: 37 },
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
  age: 70, planToAge: 95,
  // Employment
  monthlySalary: 8000, retirementAge: 75, annualRaises: 2.0, savingsRatePercent: 15,
  // Retirement Income
  socialSecurity: 3200, ssStartAge: 70, pension: 0, annuityIncome: 0, rentalIncome: 0, otherIncome: 0,
  // Assets — split pre-tax vs taxable
  liquidSavings: 250000,
  preTaxAccounts: 600000,   // IRA, 401(k)
  taxableAccounts: 200000,  // Brokerage
  expectedReturn: 5.0, inflationRate: 3.0,
  // Tax
  filingStatus: "married", // "single" | "married"
  effectiveTaxRate: 18,
  // Healthcare
  useHealthcareInflation: true,
  healthcareInflationRate: 5.5,
  // Fixed expenses
  housing: 2200, insurance: 600, utilities: 350, healthcare: 800,
  debtPayments: 0, taxes: 500,
  // Variable expenses
  groceries: 600, dining: 300, transportation: 400, entertainment: 200,
  travel: 500, giftsCharity: 300, personalCare: 150, miscellaneous: 200,
  // One-time
  plannedLargeExpenses: 0, largeExpenseYear: 0,
  // Scenario
  scenarioEnabled: false,
  scenarioType: "retireLater",   // retireLater | cutSpending | delaySS | savingsBoost
  scenarioRetireAge: 77,
  scenarioCutAmount: 300,
  scenarioSSAge: 70,
  scenarioSavingsRate: 25,
};

// ============================================================
// FORMATTERS
// ============================================================
const fmt = (n) => {
  if (n == null || isNaN(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n < 0 ? "-" : "") + "$" + (abs / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n < 0 ? "-" : "") + "$" + (abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1) + "K";
  return "$" + Math.round(n).toLocaleString();
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
  const nonHCMonthly = fixedNonHC + variableMonthly;
  const hcMonthly = cfg.healthcare || 0;
  const fixedMonthly = fixedNonHC + hcMonthly;
  const totalMonthlyBase = nonHCMonthly + hcMonthly;

  const effectiveRate = (cfg.effectiveTaxRate || 18) / 100;
  const projection = [];
  let preTax = cfg.preTaxAccounts || 0;
  let taxable = (cfg.liquidSavings || 0) + (cfg.taxableAccounts || 0);

  for (let y = 0; y <= yearsLeft; y++) {
    const thisAge = age + y;
    const inflMult = Math.pow(1 + inflRate, y);
    const hcInflMult = Math.pow(1 + hcInflRate, y);

    const adjNonHC = nonHCMonthly * 12 * inflMult;
    const adjHC = hcMonthly * 12 * hcInflMult;
    const adjExpenses = adjNonHC + adjHC;

    const working = thisAge < retireAge;
    const salaryThisYear = working ? monthlySalary * 12 * Math.pow(1 + (cfg.annualRaises || 0) / 100, y) : 0;
    const ssThisYear = thisAge >= (cfg.ssStartAge || 70) ? (cfg.socialSecurity || 0) * 12 : 0;
    const retIncomeThisYear = retirementMonthly * 12;

    // RMD calculation
    const divisor = RMD_TABLE[thisAge];
    const rmdRequired = (thisAge >= RMD_START_AGE && divisor && preTax > 0) ? preTax / divisor : 0;

    const totalGrossIncome = salaryThisYear + ssThisYear + retIncomeThisYear + rmdRequired;

    const estTax = totalGrossIncome * effectiveRate;
    const totalNetIncome = totalGrossIncome - estTax;

    const marginalBracket = getMarginalBracket(totalGrossIncome, cfg.filingStatus || "married");

    if (y > 0) {
      // Grow accounts
      preTax = preTax * (1 + realReturn);
      taxable = taxable * (1 + realReturn);

      // RMD: move from pre-tax to taxable (already counted as income)
      if (rmdRequired > 0) {
        preTax -= rmdRequired;
        // RMD income is spent or reinvested; net goes to taxable
      }

      // Salary savings
      if (working && salaryThisYear > 0) {
        const saved = salaryThisYear * savingsRate;
        preTax += saved * 0.7; // assume 70% pre-tax savings
        taxable += saved * 0.3;
      }

      // Net cash flow (income after tax minus expenses)
      const netCashFlow = totalNetIncome - adjExpenses;

      // Apply net cash flow to taxable first, then draw from pre-tax
      taxable += netCashFlow;

      // If taxable goes negative, pull from pre-tax
      if (taxable < 0) {
        preTax += taxable; // taxable is negative, so this reduces preTax
        taxable = 0;
      }

      // Large expense
      if (cfg.plannedLargeExpenses > 0 && thisAge === age + (cfg.largeExpenseYear || 0)) {
        taxable -= cfg.plannedLargeExpenses;
        if (taxable < 0) { preTax += taxable; taxable = 0; }
      }
    }

    const totalWealth = preTax + taxable;

    projection.push({
      age: thisAge, year: y, wealth: Math.round(totalWealth),
      preTax: Math.round(preTax), taxable: Math.round(taxable),
      annualExpenses: Math.round(adjExpenses),
      annualIncome: Math.round(totalGrossIncome),
      annualNetIncome: Math.round(totalNetIncome),
      rmd: Math.round(rmdRequired),
      marginalBracket,
      phase: working ? "working" : "retired",
    });
  }

  const depletionAge = projection.find(d => d.wealth <= 0)?.age || null;
  const fundedYears = depletionAge ? depletionAge - age : yearsLeft;
  const fundedPct = yearsLeft > 0 ? Math.min(100, (fundedYears / yearsLeft) * 100) : 100;
  const wealthAtEnd = projection[projection.length - 1]?.wealth || 0;
  const wealthAtRetirement = projection.find(d => d.age === retireAge)?.wealth || (preTax + taxable);

  // Retirement withdrawal rate
  const retireYearNonHC = nonHCMonthly * 12 * Math.pow(1 + inflRate, Math.max(0, retireAge - age));
  const retireYearHC = hcMonthly * 12 * Math.pow(1 + hcInflRate, Math.max(0, retireAge - age));
  const retireYearExpenses = retireYearNonHC + retireYearHC;
  const retireYearIncome = ((cfg.socialSecurity || 0) * 12 + retirementMonthly * 12) * (1 - (cfg.effectiveTaxRate || 18) / 100);
  const retireAnnualGap = Math.max(0, retireYearExpenses - retireYearIncome);
  const withdrawalRate = wealthAtRetirement > 0 ? (retireAnnualGap / wealthAtRetirement) * 100 : 0;

  // Current month picture
  const isWorking = age < retireAge;
  const ssActive = age >= (cfg.ssStartAge || 70);
  const currentMonthlyGross = (isWorking ? monthlySalary : 0) + (ssActive ? (cfg.socialSecurity || 0) : 0) + retirementMonthly;
  const currentMonthlyNet = currentMonthlyGross * (1 - effectiveRate);
  const monthlyGap = currentMonthlyNet - totalMonthlyBase;
  const cushionMonths = totalMonthlyBase > 0 ? (preTax + taxable) / totalMonthlyBase : 999;

  return {
    projection, depletionAge, fundedYears, fundedPct, wealthAtEnd, wealthAtRetirement,
    withdrawalRate, fixedMonthly, variableMonthly, totalMonthlyBase, monthlyGap,
    currentMonthlyGross, currentMonthlyNet, cushionMonths, retireAnnualGap,
    totalAssets: (cfg.preTaxAccounts || 0) + (cfg.liquidSavings || 0) + (cfg.taxableAccounts || 0),
    preTaxStart: cfg.preTaxAccounts || 0, isWorking,
    savedFromSalary: isWorking ? monthlySalary * savingsRate : 0,
  };
}

// ============================================================
// UI COMPONENTS
// ============================================================

function NumberInput({ label, value, onChange, prefix = "$", min = 0, max, hint }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { if (!focused) setRaw(String(value)); }, [value, focused]);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--c-label)", fontWeight: 500, marginBottom: 4, letterSpacing: 0.2 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--c-hint)", marginLeft: 6, fontSize: 11.5 }}>{hint}</span>}
      </label>
      <div style={{
        display: "flex", alignItems: "center", background: "var(--c-input-bg)", borderRadius: 10,
        border: focused ? "2px solid var(--c-accent)" : "2px solid var(--c-border)", padding: "0 12px", transition: "border .15s"
      }}>
        {prefix && <span style={{ color: "var(--c-hint)", fontWeight: 600, fontSize: 16, marginRight: 4, userSelect: "none" }}>{prefix}</span>}
        <input type="text" inputMode="decimal"
          value={focused ? raw : Number(value).toLocaleString()}
          onFocus={() => { setFocused(true); setRaw(String(value)); }}
          onBlur={() => { setFocused(false); const n = parseFloat(raw.replace(/,/g, "")); if (!isNaN(n)) onChange(Math.max(min, max != null ? Math.min(n, max) : n)); }}
          onChange={e => setRaw(e.target.value)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 17, fontFamily: "var(--font)", fontWeight: 600, color: "var(--c-text)", padding: "11px 0" }}
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
      <button onClick={() => onChange(!value)} style={{
        width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative",
        background: value ? "var(--c-accent)" : "var(--c-border)", transition: "background .2s",
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3,
          left: value ? 25 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)"
        }} />
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
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            padding: "9px 18px", borderRadius: 10, border: "2px solid",
            borderColor: value === o.value ? "var(--c-accent)" : "var(--c-border)",
            background: value === o.value ? "var(--c-accent-light)" : "var(--c-input-bg)",
            color: value === o.value ? "var(--c-accent)" : "var(--c-text)",
            fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "var(--font)",
            transition: "all .15s",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 18, borderRadius: 14, background: "var(--c-card)", border: "1px solid var(--c-border)", overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", width: "100%", padding: "16px 20px",
        background: "none", border: "none", cursor: "pointer", gap: 10
      }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 16, fontWeight: 700, color: "var(--c-text)", fontFamily: "var(--font)" }}>
          {title}
          {badge && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: "var(--c-accent-light)", color: "var(--c-accent)" }}>{badge}</span>}
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
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const barAreaH = height - 30; // reserve 30px for labels
  return (
    <div style={{ width: "100%", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: barAreaH }}>
        {data.map((d, i) => {
          const barH = Math.max((Math.abs(d.value) / maxVal) * barAreaH * 0.9, 3);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, padding: "0 2px" }}>
              <div style={{ fontSize: 9, color: "var(--c-hint)", marginBottom: 3, fontWeight: 600 }}>{d.value > 0 ? fmtFull(d.value) : ""}</div>
              <div style={{
                width: "100%", maxWidth: 28, borderRadius: "5px 5px 2px 2px",
                height: barH,
                background: d.highlight ? "var(--c-accent)" : "var(--c-bar)", opacity: 0.9, transition: "height .4s",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ height: 1, background: "var(--c-border)", margin: "0 0 4px" }} />
      <div style={{ display: "flex", justifyContent: "space-around" }}>
        {data.map((d, i) => <div key={i} style={{ fontSize: 10, color: "var(--c-hint)", textAlign: "center", flex: 1, padding: "0 1px" }}>{d.label}</div>)}
      </div>
    </div>
  );
}

function ProjectionChart({ mainData, scenarioData, retirementAge }) {
  if (!mainData || mainData.length === 0) return null;
  const allData = scenarioData ? [...mainData.map(d => d.wealth), ...scenarioData.map(d => d.wealth)] : mainData.map(d => d.wealth);
  const maxW = Math.max(...allData, 1);
  const minW = Math.min(...allData, 0);
  const range = maxW - minW || 1;
  const h = 280, w = 620;
  const pad = { t: 22, r: 20, b: 40, l: 65 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;

  const toPoints = (data) => data.map((d, i) => {
    const x = pad.l + (i / (data.length - 1)) * cw;
    const y = pad.t + ((maxW - d.wealth) / range) * ch;
    return `${x},${y}`;
  });

  const mainPts = toPoints(mainData);
  const scenPts = scenarioData ? toPoints(scenarioData) : null;
  const areaPts = [...mainPts, `${pad.l + cw},${pad.t + ch}`, `${pad.l},${pad.t + ch}`];
  const retireIdx = mainData.findIndex(d => d.age === retirementAge);
  const depletionYear = mainData.find(d => d.wealth <= 0);

  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => ({
    val: maxW - (i / yTicks) * range,
    y: pad.t + (i / yTicks) * ch,
  }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {retireIdx > 0 && retireIdx < mainData.length && (
        <rect x={pad.l} y={pad.t} width={(retireIdx / (mainData.length - 1)) * cw} height={ch} fill="var(--c-accent)" opacity={0.04} rx={4} />
      )}
      {yLabels.map((yl, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={yl.y} y2={yl.y} stroke="var(--c-border)" strokeWidth={0.7} strokeDasharray={yl.val === 0 ? "0" : "4,4"} />
          <text x={pad.l - 8} y={yl.y + 4} textAnchor="end" fontSize={10} fill="var(--c-hint)" fontFamily="var(--font)">{fmt(yl.val)}</text>
        </g>
      ))}
      {minW < 0 && <line x1={pad.l} x2={w - pad.r} y1={pad.t + ((maxW) / range) * ch} y2={pad.t + ((maxW) / range) * ch} stroke="var(--c-danger)" strokeWidth={1.5} />}
      {retireIdx > 0 && retireIdx < mainData.length && (() => {
        const rx = pad.l + (retireIdx / (mainData.length - 1)) * cw;
        return (<g><line x1={rx} x2={rx} y1={pad.t} y2={pad.t + ch} stroke="var(--c-accent)" strokeWidth={1.2} strokeDasharray="6,4" opacity={0.6} /><text x={rx} y={pad.t - 5} textAnchor="middle" fontSize={9.5} fill="var(--c-accent)" fontWeight={600}>Retire</text></g>);
      })()}
      <polygon points={areaPts.join(" ")} fill="url(#aGrad)" opacity={0.3} />
      <polyline points={mainPts.join(" ")} fill="none" stroke="var(--c-accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {scenPts && (
        <polyline points={scenPts.join(" ")} fill="none" stroke="var(--c-scenario)" strokeWidth={2.5} strokeLinejoin="round" strokeDasharray="8,4" />
      )}
      {mainData.filter((_, i) => i % Math.max(1, Math.floor(mainData.length / 6)) === 0 || i === mainData.length - 1).map(d => {
        const x = pad.l + (mainData.indexOf(d) / (mainData.length - 1)) * cw;
        return <text key={d.age} x={x} y={h - 8} textAnchor="middle" fontSize={10} fill="var(--c-hint)" fontFamily="var(--font)">Age {d.age}</text>;
      })}
      {depletionYear && (() => {
        const dx = pad.l + (mainData.indexOf(depletionYear) / (mainData.length - 1)) * cw;
        return (<g><line x1={dx} x2={dx} y1={pad.t} y2={pad.t + ch} stroke="var(--c-danger)" strokeWidth={1.5} strokeDasharray="6,4" /><text x={dx} y={pad.t - 4} textAnchor="middle" fontSize={10} fill="var(--c-danger)" fontWeight={700}>⚠ Funds depleted</text></g>);
      })()}
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.5} />
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
          <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 132} 132`} style={{ transition: "stroke-dasharray .6s" }} />
        </svg>
        <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, fontSize: 18, fontWeight: 800, color, fontFamily: "var(--font)" }}>{Math.round(value)}%</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--c-hint)", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status, label }) {
  const c = { good: { bg: "#EDF2EE", text: "#4A6B5A", icon: "✓" }, warning: { bg: "#F9F3E6", text: "#9E7C2B", icon: "⚠" }, danger: { bg: "#F5E8E8", text: "#8B2020", icon: "✕" } }[status] || { bg: "#EDF2EE", text: "#4A6B5A", icon: "✓" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, background: c.bg, color: c.text, fontSize: 12, fontWeight: 700 }}>{c.icon} {label}</span>;
}

function PhasePill({ isWorking }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 20, background: isWorking ? "rgba(184,168,138,0.15)" : "rgba(184,168,138,0.25)", color: isWorking ? "#B8A88A" : "#B8A88A", fontSize: 12, fontWeight: 600 }}>{isWorking ? "💼 Working" : "🌴 Retired"}</span>;
}

// ============================================================
// MAIN APP
// ============================================================
export default function FinancialModel() {
  const [p, setP] = useState(defaultProfile);
  const [view, setView] = useState("dashboard");
  const upd = useCallback((key, val) => setP(prev => ({ ...prev, [key]: val })), []);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const isCurrentlyWorking = (p.age || 70) < (p.retirementAge || 75);
  const yearsUntilRetirement = Math.max(0, (p.retirementAge || 75) - (p.age || 70));

  // Main projection
  const main = useMemo(() => runProjection(p), [p]);

  // Scenario projection
  const scenario = useMemo(() => {
    if (!p.scenarioEnabled) return null;
    const overrides = {};
    switch (p.scenarioType) {
      case "retireLater": overrides.retirementAge = p.scenarioRetireAge || 77; break;
      case "cutSpending": {
        const cut = (p.scenarioCutAmount || 300);
        // Distribute cut proportionally across variable expenses
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
      case "delaySS": overrides.ssStartAge = p.scenarioSSAge || 70; break;
      case "savingsBoost": overrides.savingsRatePercent = p.scenarioSavingsRate || 25; break;
    }
    return runProjection(p, overrides);
  }, [p]);

  // Recommendations
  const recs = useMemo(() => {
    const r = [];
    const m = main;
    if (m.isWorking) {
      const ytr = (p.retirementAge || 75) - (p.age || 70);
      r.push({ type: "good", text: `${ytr} working year${ytr > 1 ? "s" : ""} remaining. Projected nest egg at retirement: ${fmtFull(m.wealthAtRetirement)}.` });
      const sr = (p.savingsRatePercent || 0);
      if (sr < 15) r.push({ type: "warning", text: `Savings rate of ${sr}% is below 15%. Use the "What If" scenario to see the impact of boosting it.` });
    }
    if (m.withdrawalRate > 5) r.push({ type: "danger", text: `Projected retirement withdrawal rate: ${m.withdrawalRate.toFixed(1)}% (above 4% safe guideline). Consider working longer or reducing spending.` });
    else if (m.withdrawalRate > 4) r.push({ type: "warning", text: `Retirement withdrawal rate of ${m.withdrawalRate.toFixed(1)}% is slightly above 4%. A small adjustment would strengthen long-term sustainability.` });
    else if (m.withdrawalRate > 0) r.push({ type: "good", text: `Withdrawal rate of ${m.withdrawalRate.toFixed(1)}% is within the safe range.` });

    if (m.depletionAge) r.push({ type: "danger", text: `Funds may run out by age ${m.depletionAge}. Use "What If" scenarios to explore solutions.` });

    // RMD + tax bracket warning
    const rmdYear = main.projection.find(d => d.rmd > 0);
    if (rmdYear) {
      const firstRMD = rmdYear.rmd;
      r.push({ type: "warning", text: `Required Minimum Distributions begin at age ${rmdYear.age} (${fmtFull(firstRMD)}/year). This is taxable income — monitor your bracket.` });
    }

    // Bracket alert
    const highBracket = main.projection.find(d => d.marginalBracket >= 32);
    if (highBracket) r.push({ type: "warning", text: `Income at age ${highBracket.age} may push you into the ${highBracket.marginalBracket}% bracket. Consider Roth conversions or income smoothing strategies.` });

    if (p.useHealthcareInflation) {
      const hcAt90 = (p.healthcare || 0) * 12 * Math.pow((p.healthcareInflationRate || 5.5) / 100 + 1, Math.max(0, 90 - (p.age || 70)));
      const genAt90 = (p.healthcare || 0) * 12 * Math.pow((p.inflationRate || 3) / 100 + 1, Math.max(0, 90 - (p.age || 70)));
      if (hcAt90 > genAt90 * 1.3) r.push({ type: "warning", text: `Healthcare at age 90: ${fmtFull(hcAt90)}/year with medical inflation vs ${fmtFull(genAt90)} with general inflation. This is a major cost driver.` });
    }

    // Scenario comparison
    if (scenario && !scenario.depletionAge && main.depletionAge) {
      r.push({ type: "good", text: `The "What If" scenario eliminates fund depletion entirely — ending with ${fmtFull(scenario.wealthAtEnd)} at age ${p.planToAge}.` });
    } else if (scenario && scenario.wealthAtEnd > main.wealthAtEnd) {
      const diff = scenario.wealthAtEnd - main.wealthAtEnd;
      r.push({ type: "good", text: `The "What If" scenario adds ${fmtFull(diff)} to your ending wealth at age ${p.planToAge}.` });
    }

    if (r.length === 0) r.push({ type: "good", text: "Your plan is well-funded through your planning horizon." });
    return r;
  }, [main, scenario, p]);

  // Expense breakdown
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

  // Safety score
  const safetyScore = useMemo(() => {
    const wdSafe = main.withdrawalRate <= 4 ? 100 : main.withdrawalRate <= 6 ? 60 : 20;
    const fundSafe = main.fundedPct;
    const cushSafe = main.cushionMonths >= 60 ? 100 : main.cushionMonths >= 24 ? 70 : 30;
    return Math.round(wdSafe * 0.35 + fundSafe * 0.45 + cushSafe * 0.2);
  }, [main]);

  // Build financial context for chat
  const buildFinancialContext = useCallback(() => {
    // Compact projection: only key milestone ages
    const milestones = [];
    const ages = new Set([p.age, p.retirementAge, p.ssStartAge, RMD_START_AGE, 80, 85, 90, p.planToAge]);
    if (main.depletionAge) ages.add(main.depletionAge);
    main.projection.forEach(d => { if (ages.has(d.age)) milestones.push(d); });

    return `Financial planning assistant. Answer with specific numbers. Be concise and direct. Plain language for a non-technical user. 2-4 short paragraphs max.

PROFILE: Age ${p.age}, plan to ${p.planToAge}. ${isCurrentlyWorking ? `Working, retires ${p.retirementAge}. Salary $${p.monthlySalary}/mo, saves ${p.savingsRatePercent}%.` : "Retired."}
INCOME: SS $${p.socialSecurity}/mo from age ${p.ssStartAge}. Pension $${p.pension}/mo. Rental $${p.rentalIncome}/mo. Other $${p.otherIncome}/mo.
ASSETS: Pre-tax $${p.preTaxAccounts} (RMDs age ${RMD_START_AGE}). Taxable $${p.taxableAccounts}. Liquid $${p.liquidSavings}. Total ${fmtFull(main.totalAssets)}. Return ${p.expectedReturn}%, inflation ${p.inflationRate}%.
TAX: ${p.filingStatus}, ${p.effectiveTaxRate}% effective, ${main.projection[0]?.marginalBracket || 0}% marginal.
EXPENSES: $${main.totalMonthlyBase}/mo ($${main.fixedMonthly} fixed, $${main.variableMonthly} variable). HC $${p.healthcare}/mo at ${p.useHealthcareInflation ? p.healthcareInflationRate : p.inflationRate}% inflation.
METRICS: Income $${Math.round(main.currentMonthlyNet)}/mo net. Gap $${Math.round(main.monthlyGap)}/mo. Withdrawal ${main.withdrawalRate.toFixed(1)}%. Safety ${safetyScore}/100. ${main.depletionAge ? `DEPLETES AGE ${main.depletionAge}.` : `Funded. Ends ${fmtFull(main.wealthAtEnd)}.`} Cushion ${Math.round(main.cushionMonths)}mo.
MILESTONES: ${milestones.map(d => `${d.age}:${fmtFull(d.wealth)}${d.rmd > 0 ? `/RMD${fmtFull(d.rmd)}` : ""}`).join(" | ")}${scenario ? `\nSCENARIO(${p.scenarioType}): ends ${fmtFull(scenario.wealthAtEnd)} vs ${fmtFull(main.wealthAtEnd)}, wd ${scenario.withdrawalRate.toFixed(1)}%` : ""}`;
  }, [p, main, scenario, safetyScore, isCurrentlyWorking]);

  // Send chat message
  const sendChatMessage = useCallback(async (messageText) => {
    const userMsg = messageText || chatInput.trim();
    if (!userMsg || chatLoading) return;

    const newMessages = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: buildFinancialContext(),
          messages: newMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      const assistantText = data.content?.map(c => c.type === "text" ? c.text : "").filter(Boolean).join("\n") || "Sorry, I couldn't process that. Please try again.";
      setChatMessages(prev => [...prev, { role: "assistant", content: assistantText }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "assistant", content: "There was an error connecting. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, chatLoading, buildFinancialContext]);

  const tabStyle = (active) => ({
    padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
    background: active ? "var(--c-accent)" : "transparent", color: active ? "#fff" : "var(--c-text)",
    fontWeight: 700, fontSize: 14, fontFamily: "var(--font)", transition: "all .15s",
  });

  const statBox = (label, value, sub, accent) => (
    <div style={{ background: "var(--c-card)", borderRadius: 14, padding: "16px 18px", border: "1px solid var(--c-border)", flex: "1 1 140px", minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "var(--c-hint)", fontWeight: 600, marginBottom: 3, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent || "var(--c-text)", fontFamily: "var(--font)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--c-hint)", marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const SCENARIO_OPTIONS = [
    { value: "retireLater", label: "Work Longer" },
    { value: "cutSpending", label: "Cut Spending" },
    { value: "delaySS", label: "Delay Social Security" },
    { value: "savingsBoost", label: "Save More" },
  ];

  return (
    <div style={{
      "--c-bg": "#F7F6F4", "--c-card": "#FFFFFF", "--c-text": "#1C1C28", "--c-label": "#2D2D3A",
      "--c-hint": "#7A7A8C", "--c-border": "#E2E0DC", "--c-input-bg": "#F0EFEC",
      "--c-accent": "#1C1C28", "--c-accent-light": "#EAEAE8", "--c-bar": "#B8A88A",
      "--c-danger": "#8B2020", "--c-warning": "#9E7C2B", "--c-safe": "#4A6B5A",
      "--c-scenario": "#B8A88A",
      "--font": "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
      fontFamily: "var(--font)", background: "var(--c-bg)", color: "var(--c-text)", minHeight: "100vh", padding: "0 0 40px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "#1C1C28", padding: "24px 28px 20px", color: "#E8E4DE", borderRadius: "0 0 20px 20px" }}>
        <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: "#B8A88A", fontWeight: 600 }}>Wealth Planning</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: "#F0EFEC", letterSpacing: -0.3 }}>Financial Planning Model</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <PhasePill isWorking={isCurrentlyWorking} />
          <span style={{ fontSize: 13, color: "#9A9AA8" }}>
            {isCurrentlyWorking ? `${yearsUntilRetirement}yr to retirement · ` : ""}Plan to age {p.planToAge}
          </span>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 6, padding: "16px 20px 8px", flexWrap: "wrap" }}>
        {[["dashboard","📊 Dashboard"],["inputs","✏️ Edit Numbers"],["whatif","🔮 What If"],["details","📋 Details"],["chat","💬 Ask"]].map(([k,l]) => (
          <button key={k} style={tabStyle(view === k)} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>

      <div style={{ padding: "8px 20px 0", maxWidth: 820, margin: "0 auto" }}>

        {/* ===================== DASHBOARD ===================== */}
        {view === "dashboard" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "12px 0 20px", flexWrap: "wrap" }}>
              {safetyScore >= 75 ? <StatusBadge status="good" label="Plan On Track" /> :
               safetyScore >= 45 ? <StatusBadge status="warning" label="Needs Attention" /> :
               <StatusBadge status="danger" label="Action Required" />}
              <span style={{ fontSize: 13, color: "var(--c-hint)" }}>Safety Score: <strong style={{ color: "var(--c-text)" }}>{safetyScore}/100</strong></span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              {statBox("Monthly Income", fmtFull(main.currentMonthlyNet),
                isCurrentlyWorking ? `${fmtFull(main.currentMonthlyGross)} gross · ${p.effectiveTaxRate}% tax` : `After ${p.effectiveTaxRate}% tax`
              )}
              {statBox("Monthly Spending", fmtFull(main.totalMonthlyBase),
                `${fmtFull(main.fixedMonthly)} fixed + ${fmtFull(main.variableMonthly)} variable`
              )}
              {statBox("Monthly Surplus / Gap", fmtFull(main.monthlyGap),
                main.monthlyGap >= 0 ? "Income covers expenses" : "Drawing from savings",
                main.monthlyGap >= 0 ? "var(--c-safe)" : "var(--c-danger)"
              )}
              {statBox("Total Assets", fmtFull(main.totalAssets),
                `${fmtFull(main.preTaxStart)} pre-tax · ${fmtFull(main.totalAssets - main.preTaxStart)} taxable`
              )}
            </div>

            {/* Tax & RMD callout */}
            {(() => {
              const firstRMD = main.projection.find(d => d.rmd > 0);
              const currentBracket = main.projection[0]?.marginalBracket || 0;
              return (
                <div style={{
                  display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16,
                }}>
                  <div style={{ flex: "1 1 180px", background: "var(--c-card)", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: 11, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Marginal Tax Bracket</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: currentBracket >= 32 ? "var(--c-danger)" : "var(--c-text)", fontFamily: "var(--font)" }}>{currentBracket}%</div>
                    <div style={{ fontSize: 11, color: "var(--c-hint)" }}>{p.filingStatus === "married" ? "Married Filing Jointly" : "Single"}</div>
                  </div>
                  <div style={{ flex: "1 1 180px", background: "var(--c-card)", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: 11, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      {firstRMD ? "Next RMD" : "RMDs"}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font)" }}>
                      {firstRMD ? fmtFull(firstRMD.rmd) : "N/A"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--c-hint)" }}>
                      {firstRMD ? `Age ${firstRMD.age} · from pre-tax accounts` : (p.age || 70) >= RMD_START_AGE ? "No pre-tax balance" : `Starts age ${RMD_START_AGE}`}
                    </div>
                  </div>
                  <div style={{ flex: "1 1 180px", background: "var(--c-card)", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--c-border)" }}>
                    <div style={{ fontSize: 11, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Withdrawal Rate</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: main.withdrawalRate > 5 ? "var(--c-danger)" : main.withdrawalRate > 4 ? "var(--c-warning)" : "var(--c-safe)", fontFamily: "var(--font)" }}>{main.withdrawalRate.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: "var(--c-hint)" }}>{isCurrentlyWorking ? "Projected at retirement" : "Current rate"}</div>
                  </div>
                </div>
              );
            })()}

            {/* Gauges */}
            <div style={{ display: "flex", gap: 20, justifyContent: "center", margin: "16px 0", background: "var(--c-card)", borderRadius: 14, padding: "20px 16px", border: "1px solid var(--c-border)", flexWrap: "wrap" }}>
              <Gauge value={main.fundedPct} label="Years Funded" danger={main.fundedPct < 50} warning={main.fundedPct < 80} />
              <Gauge value={Math.min(100, (4 / Math.max(main.withdrawalRate, 0.1)) * 100)} label="Withdrawal Safety" danger={main.withdrawalRate > 6} warning={main.withdrawalRate > 4} />
              <Gauge value={Math.min(100, (main.cushionMonths / 60) * 100)} label="Cash Cushion" danger={main.cushionMonths < 12} warning={main.cushionMonths < 24} />
            </div>

            {/* Projection Chart */}
            <div style={{ background: "var(--c-card)", borderRadius: 14, padding: "20px", border: "1px solid var(--c-border)", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Wealth Projection to Age {p.planToAge}</div>
                {scenario && <div style={{ display: "flex", gap: 12, fontSize: 11, alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 16, height: 3, background: "var(--c-accent)", borderRadius: 2, display: "inline-block" }} /> Current</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 16, height: 3, background: "var(--c-scenario)", borderRadius: 2, display: "inline-block", borderBottom: "1px dashed var(--c-scenario)" }} /> What If</span>
                </div>}
              </div>
              <div style={{ fontSize: 12, color: "var(--c-hint)", marginBottom: 8 }}>
                {main.depletionAge ? `⚠ Funds may run out at age ${main.depletionAge}` : `Ending: ${fmtFull(main.wealthAtEnd)}`}
                {scenario && ` · What If ending: ${fmtFull(scenario.wealthAtEnd)}`}
              </div>
              <ProjectionChart mainData={main.projection} scenarioData={scenario?.projection} retirementAge={p.retirementAge} />
            </div>

            {/* Spending */}
            <div style={{ background: "var(--c-card)", borderRadius: 14, padding: "20px", border: "1px solid var(--c-border)", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Monthly Spending</div>
              {p.useHealthcareInflation && <div style={{ fontSize: 11, color: "var(--c-warning)", marginBottom: 4 }}>⚡ Healthcare inflates at {p.healthcareInflationRate}% vs {p.inflationRate}% general</div>}
              <MiniBar data={expenseBreakdown.map((d, i) => ({ ...d, highlight: i < 3 }))} height={170} />
            </div>

            {/* Recs */}
            <div style={{ background: "var(--c-card)", borderRadius: 14, padding: "20px", border: "1px solid var(--c-border)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>💡 Recommendations</div>
              {recs.map((r, i) => (
                <div key={i} style={{
                  padding: "12px 16px", borderRadius: 10, marginBottom: 8,
                  background: r.type === "danger" ? "#F5E8E8" : r.type === "warning" ? "#F9F3E6" : "#EDF2EE",
                  borderLeft: `4px solid ${r.type === "danger" ? "var(--c-danger)" : r.type === "warning" ? "var(--c-warning)" : "var(--c-safe)"}`,
                  fontSize: 13.5, lineHeight: 1.5,
                }}>{r.text}</div>
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

            <Section title="About You" icon="👤">
              <NumberInput label="Current Age" value={p.age} onChange={v => upd("age", v)} prefix="" hint="years" />
              <NumberInput label="Plan Through Age" value={p.planToAge} onChange={v => upd("planToAge", v)} prefix="" hint="how long to plan for" />
            </Section>

            <Section title="Employment & Salary" icon="💼" badge={isCurrentlyWorking ? "Active" : "Retired"}>
              <NumberInput label="Monthly Salary (Take-Home)" value={p.monthlySalary} onChange={v => upd("monthlySalary", v)} hint="before your savings deduction" />
              <NumberInput label="Planned Retirement Age" value={p.retirementAge} onChange={v => upd("retirementAge", v)} prefix="" hint="when salary stops" />
              <PercentInput label="Annual Raise Assumption" value={p.annualRaises} onChange={v => upd("annualRaises", v)} hint="typical 2–3%" />
              <PercentInput label="Savings Rate (% of Salary)" value={p.savingsRatePercent} onChange={v => upd("savingsRatePercent", v)} hint="goes into investments each year" />
            </Section>

            <Section title="Retirement Income" icon="🌴">
              <NumberInput label="Social Security (Monthly)" value={p.socialSecurity} onChange={v => upd("socialSecurity", v)} />
              <NumberInput label="Social Security Start Age" value={p.ssStartAge} onChange={v => upd("ssStartAge", v)} prefix="" hint="62, 67, or 70" />
              <NumberInput label="Pension" value={p.pension} onChange={v => upd("pension", v)} />
              <NumberInput label="Annuity Income" value={p.annuityIncome} onChange={v => upd("annuityIncome", v)} />
              <NumberInput label="Rental Income" value={p.rentalIncome} onChange={v => upd("rentalIncome", v)} />
              <NumberInput label="Other Income" value={p.otherIncome} onChange={v => upd("otherIncome", v)} hint="RMDs flow automatically" />
            </Section>

            <Section title="Savings & Investments" icon="🏦">
              <NumberInput label="Liquid Savings" value={p.liquidSavings} onChange={v => upd("liquidSavings", v)} hint="checking, savings, CDs" />
              <NumberInput label="Pre-Tax Accounts (IRA, 401k)" value={p.preTaxAccounts} onChange={v => upd("preTaxAccounts", v)} hint="subject to RMDs" />
              <NumberInput label="Taxable Accounts (Brokerage)" value={p.taxableAccounts} onChange={v => upd("taxableAccounts", v)} hint="no RMD requirement" />
              <PercentInput label="Expected Annual Return" value={p.expectedReturn} onChange={v => upd("expectedReturn", v)} hint="before inflation" />
              <PercentInput label="Expected Inflation" value={p.inflationRate} onChange={v => upd("inflationRate", v)} hint="typically 2.5–3.5%" />
            </Section>

            <Section title="Tax Settings" icon="🧾" defaultOpen={false}>
              <SelectInput label="Filing Status" value={p.filingStatus} onChange={v => upd("filingStatus", v)}
                options={[{ value: "single", label: "Single" }, { value: "married", label: "Married Filing Jointly" }]} />
              <PercentInput label="Estimated Effective Tax Rate" value={p.effectiveTaxRate} onChange={v => upd("effectiveTaxRate", v)} hint="federal + state combined, typically 15–25%" />
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--c-accent-light)", fontSize: 12.5, color: "var(--c-accent)", lineHeight: 1.5 }}>
                RMDs are auto-calculated from your pre-tax accounts starting at age {RMD_START_AGE} using the IRS Uniform Lifetime Table. They appear as taxable income.
              </div>
            </Section>

            <Section title="Healthcare" icon="🏥" defaultOpen={false}>
              <NumberInput label="Monthly Healthcare Cost" value={p.healthcare} onChange={v => upd("healthcare", v)} hint="premiums, prescriptions, copays" />
              <Toggle label="Use Higher Healthcare Inflation" value={p.useHealthcareInflation} onChange={v => upd("useHealthcareInflation", v)}
                hint={`Healthcare typically inflates faster than general costs (${p.healthcareInflationRate}% vs ${p.inflationRate}%)`} />
              {p.useHealthcareInflation && (
                <PercentInput label="Healthcare Inflation Rate" value={p.healthcareInflationRate} onChange={v => upd("healthcareInflationRate", v)} hint="typically 5–6%" />
              )}
            </Section>

            <Section title="Fixed Monthly Expenses" icon="🏠" defaultOpen={false}>
              <NumberInput label="Housing" value={p.housing} onChange={v => upd("housing", v)} hint="mortgage, rent, HOA" />
              <NumberInput label="Insurance" value={p.insurance} onChange={v => upd("insurance", v)} hint="home, auto, life, umbrella" />
              <NumberInput label="Utilities" value={p.utilities} onChange={v => upd("utilities", v)} hint="electric, water, internet, phone" />
              <NumberInput label="Debt Payments" value={p.debtPayments} onChange={v => upd("debtPayments", v)} hint="auto loan, credit cards" />
              <NumberInput label="Taxes (Non-Income)" value={p.taxes} onChange={v => upd("taxes", v)} hint="property tax, estimated tax" />
            </Section>

            <Section title="Variable Monthly Expenses" icon="🛒" defaultOpen={false}>
              <NumberInput label="Groceries" value={p.groceries} onChange={v => upd("groceries", v)} />
              <NumberInput label="Dining Out" value={p.dining} onChange={v => upd("dining", v)} />
              <NumberInput label="Transportation" value={p.transportation} onChange={v => upd("transportation", v)} hint="gas, maintenance, rideshare" />
              <NumberInput label="Entertainment" value={p.entertainment} onChange={v => upd("entertainment", v)} />
              <NumberInput label="Travel" value={p.travel} onChange={v => upd("travel", v)} hint="monthly budget for trips" />
              <NumberInput label="Gifts & Charity" value={p.giftsCharity} onChange={v => upd("giftsCharity", v)} />
              <NumberInput label="Personal Care" value={p.personalCare} onChange={v => upd("personalCare", v)} />
              <NumberInput label="Miscellaneous" value={p.miscellaneous} onChange={v => upd("miscellaneous", v)} />
            </Section>

            <Section title="Planned Large Expenses" icon="🎯" defaultOpen={false}>
              <NumberInput label="Large Expense Amount" value={p.plannedLargeExpenses} onChange={v => upd("plannedLargeExpenses", v)} hint="one-time: new car, home repair" />
              <NumberInput label="Years From Now" value={p.largeExpenseYear} onChange={v => upd("largeExpenseYear", v)} prefix="" hint="when this expense occurs" />
            </Section>

            <button onClick={() => setView("dashboard")} style={{
              width: "100%", padding: "16px", borderRadius: 12, border: "none",
              background: "var(--c-accent)", color: "#fff", fontSize: 16, fontWeight: 700,
              cursor: "pointer", fontFamily: "var(--font)", marginTop: 8,
            }}>📊 View Dashboard</button>
          </div>
        )}

        {/* ===================== WHAT IF ===================== */}
        {view === "whatif" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--c-hint)", margin: "8px 0 16px", lineHeight: 1.5 }}>
              Compare your current plan against a single change. The dashed blue line on the projection chart shows the alternative.
            </div>

            <Toggle label="Enable What-If Scenario" value={p.scenarioEnabled} onChange={v => upd("scenarioEnabled", v)}
              hint="Toggle on to see comparison on the dashboard chart" />

            {p.scenarioEnabled && (
              <div style={{ background: "var(--c-card)", borderRadius: 14, padding: "20px", border: "2px solid var(--c-scenario)", marginBottom: 16 }}>
                <SelectInput label="What change would you like to explore?" value={p.scenarioType} onChange={v => upd("scenarioType", v)}
                  options={SCENARIO_OPTIONS} />

                {p.scenarioType === "retireLater" && (
                  <NumberInput label="Retire at Age" value={p.scenarioRetireAge} onChange={v => upd("scenarioRetireAge", v)} prefix="" hint={`Currently: ${p.retirementAge}`} />
                )}
                {p.scenarioType === "cutSpending" && (
                  <NumberInput label="Cut Variable Spending By ($/month)" value={p.scenarioCutAmount} onChange={v => upd("scenarioCutAmount", v)} hint="Spread across dining, travel, entertainment, misc" />
                )}
                {p.scenarioType === "delaySS" && (
                  <NumberInput label="Start Social Security at Age" value={p.scenarioSSAge} onChange={v => upd("scenarioSSAge", v)} prefix="" hint={`Currently: ${p.ssStartAge}`} />
                )}
                {p.scenarioType === "savingsBoost" && (
                  <PercentInput label="New Savings Rate" value={p.scenarioSavingsRate} onChange={v => upd("scenarioSavingsRate", v)} hint={`Currently: ${p.savingsRatePercent}%`} />
                )}

                {/* Quick comparison */}
                {scenario && (
                  <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 11, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase" }}>Current Plan</div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>Ending wealth: <strong>{fmtFull(main.wealthAtEnd)}</strong></div>
                      <div style={{ fontSize: 11 }}>Withdrawal rate: <strong>{main.withdrawalRate.toFixed(1)}%</strong></div>
                      {main.depletionAge && <div style={{ fontSize: 11, color: "var(--c-danger)", fontWeight: 600 }}>⚠ Depletes at age {main.depletionAge}</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 11, color: "var(--c-scenario)", fontWeight: 600, textTransform: "uppercase" }}>What If</div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>Ending wealth: <strong style={{ color: scenario.wealthAtEnd > main.wealthAtEnd ? "var(--c-safe)" : "var(--c-danger)" }}>{fmtFull(scenario.wealthAtEnd)}</strong></div>
                      <div style={{ fontSize: 11 }}>Withdrawal rate: <strong>{scenario.withdrawalRate.toFixed(1)}%</strong></div>
                      {scenario.depletionAge && <div style={{ fontSize: 11, color: "var(--c-danger)", fontWeight: 600 }}>⚠ Depletes at age {scenario.depletionAge}</div>}
                      {!scenario.depletionAge && main.depletionAge && <div style={{ fontSize: 11, color: "var(--c-safe)", fontWeight: 600 }}>✓ No depletion</div>}
                      <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: scenario.wealthAtEnd > main.wealthAtEnd ? "var(--c-safe)" : "var(--c-danger)" }}>
                        Difference: {fmtFull(scenario.wealthAtEnd - main.wealthAtEnd)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setView("dashboard")} style={{
              width: "100%", padding: "16px", borderRadius: 12, border: "none",
              background: "var(--c-accent)", color: "#fff", fontSize: 16, fontWeight: 700,
              cursor: "pointer", fontFamily: "var(--font)", marginTop: 8,
            }}>📊 See It On Dashboard</button>
          </div>
        )}

        {/* ===================== DETAILS ===================== */}
        {view === "details" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--c-hint)", margin: "8px 0 16px" }}>
              Year-by-year projection with RMDs, taxes, and inflation adjustments.
            </div>

            <div style={{ background: "var(--c-card)", borderRadius: 14, border: "1px solid var(--c-border)", overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Annual Summary</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 580 }}>
                  <thead>
                    <tr style={{ background: "var(--c-input-bg)" }}>
                      {["Age", "Phase", "Income", "RMD", "Tax%", "Expenses", "Wealth"].map(h => (
                        <th key={h} style={{ padding: "9px 8px", textAlign: h === "Phase" ? "left" : "right", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--c-hint)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {main.projection.filter((_, i) => i % (main.projection.length > 20 ? Math.ceil(main.projection.length / 18) : 1) === 0 || _ === main.projection[main.projection.length - 1]).map((d, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--c-border)", background: d.wealth < 0 ? "#F5E8E8" : d.phase === "working" ? "#F7F6F4" : "transparent" }}>
                        <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700 }}>{d.age}</td>
                        <td style={{ padding: "9px 8px", textAlign: "left" }}>
                          <span style={{ padding: "2px 7px", borderRadius: 6, background: d.phase === "working" ? "#EAEAE8" : "#E2E0DC", color: d.phase === "working" ? "#1C1C28" : "#7A7A8C", fontWeight: 600, fontSize: 10.5 }}>
                            {d.phase === "working" ? "Work" : "Ret"}
                          </span>
                        </td>
                        <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmtFull(d.annualIncome)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: d.rmd > 0 ? "var(--c-warning)" : "var(--c-hint)" }}>{d.rmd > 0 ? fmtFull(d.rmd) : "—"}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: d.marginalBracket >= 32 ? "var(--c-danger)" : "var(--c-hint)" }}>{d.marginalBracket}%</td>
                        <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmtFull(d.annualExpenses)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, color: d.wealth < 0 ? "var(--c-danger)" : "var(--c-text)" }}>{fmtFull(d.wealth)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ background: "var(--c-card)", borderRadius: 14, padding: "20px", border: "1px solid var(--c-border)", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Key Assumptions</div>
              {[
                ["Real return (after inflation)", `${(p.expectedReturn - p.inflationRate).toFixed(1)}%/yr`],
                ["General inflation", `${p.inflationRate}%/yr`],
                ["Healthcare inflation", p.useHealthcareInflation ? `${p.healthcareInflationRate}%/yr` : `${p.inflationRate}%/yr (same as general)`],
                ["Salary growth", `${p.annualRaises}%/yr until retirement`],
                ["Salary savings split", "70% pre-tax / 30% taxable"],
                ["RMDs", `Auto-calculated from age ${RMD_START_AGE}, IRS table`],
                ["Tax model", `${p.effectiveTaxRate}% effective rate on gross income`],
                ["Retirement income", "Fixed (not inflation-adjusted) — conservative"],
                ["Expenses", "Grow with inflation each year"],
              ].map(([k, v], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 8 ? "1px solid var(--c-border)" : "none", fontSize: 12.5, gap: 12 }}>
                  <span style={{ color: "var(--c-hint)" }}>{k}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: "var(--c-hint)", textAlign: "center", lineHeight: 1.6, padding: "8px 0 20px" }}>
              This model is for planning purposes only and does not constitute financial advice.<br />
              Consult a qualified financial advisor before making major financial decisions.
            </div>
          </div>
        )}

        {/* ===================== CHAT ===================== */}
        {view === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 400 }}>
            {/* Chat header */}
            <div style={{ marginBottom: 12, marginTop: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Ask About Your Plan</div>
              <div style={{ fontSize: 13, color: "var(--c-hint)", marginTop: 2 }}>
                Get specific answers based on your numbers. The advisor sees your full financial picture.
              </div>
            </div>

            {/* Starter questions (shown when no messages) */}
            {chatMessages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--c-hint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Suggested questions</div>
                {[
                  "What's my biggest financial risk right now?",
                  "Can I afford to spend more each month?",
                  "What happens if I work 2 more years?",
                  "How much will healthcare cost me at age 85?",
                  "When do my RMDs start and how much will they be?",
                  "Should I be worried about running out of money?",
                ].map((q, i) => (
                  <button key={i} onClick={() => sendChatMessage(q)} style={{
                    textAlign: "left", padding: "12px 16px", borderRadius: 10,
                    border: "1px solid var(--c-border)", background: "var(--c-card)",
                    cursor: "pointer", fontSize: 13.5, color: "var(--c-text)",
                    fontFamily: "var(--font)", transition: "all .15s",
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={e => { e.target.style.background = "var(--c-input-bg)"; e.target.style.borderColor = "var(--c-accent)"; }}
                  onMouseLeave={e => { e.target.style.background = "var(--c-card)"; e.target.style.borderColor = "var(--c-border)"; }}
                  >{q}</button>
                ))}
              </div>
            )}

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12,
              paddingBottom: 12,
            }}>
              {chatMessages.map((m, i) => (
                <div key={i} style={{
                  display: "flex", flexDirection: "column",
                  alignItems: m.role === "user" ? "flex-end" : "flex-start",
                }}>
                  <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {m.role === "user" ? "You" : "Advisor"}
                  </div>
                  <div style={{
                    maxWidth: "88%", padding: "12px 16px", borderRadius: 14,
                    background: m.role === "user" ? "#1C1C28" : "var(--c-card)",
                    color: m.role === "user" ? "#E8E4DE" : "var(--c-text)",
                    border: m.role === "user" ? "none" : "1px solid var(--c-border)",
                    fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", alignItems: "flex-start", flexDirection: "column" }}>
                  <div style={{ fontSize: 10, color: "var(--c-hint)", fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>Advisor</div>
                  <div style={{
                    padding: "12px 16px", borderRadius: 14, background: "var(--c-card)",
                    border: "1px solid var(--c-border)", fontSize: 13.5, color: "var(--c-hint)",
                  }}>
                    <span style={{ display: "inline-flex", gap: 4 }}>
                      <span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>●</span>
                      <span style={{ animation: "pulse 1.2s ease-in-out 0.2s infinite" }}>●</span>
                      <span style={{ animation: "pulse 1.2s ease-in-out 0.4s infinite" }}>●</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div style={{
              display: "flex", gap: 8, padding: "12px 0 4px",
              borderTop: "1px solid var(--c-border)",
            }}>
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                placeholder="Ask a question about your financial plan..."
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: 10,
                  border: "2px solid var(--c-border)", background: "var(--c-input-bg)",
                  fontSize: 14, fontFamily: "var(--font)", color: "var(--c-text)",
                  outline: "none",
                }}
                onFocus={e => e.target.style.borderColor = "var(--c-accent)"}
                onBlur={e => e.target.style.borderColor = "var(--c-border)"}
              />
              <button
                onClick={() => sendChatMessage()}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: "12px 20px", borderRadius: 10, border: "none",
                  background: chatLoading || !chatInput.trim() ? "var(--c-border)" : "#1C1C28",
                  color: chatLoading || !chatInput.trim() ? "var(--c-hint)" : "#E8E4DE",
                  fontWeight: 700, fontSize: 14, cursor: chatLoading ? "wait" : "pointer",
                  fontFamily: "var(--font)", transition: "all .15s",
                }}
              >
                Send
              </button>
            </div>

            {/* Pulse animation */}
            <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
