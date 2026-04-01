// ==============================
// IEQ FINANCIAL PORTAL — UPGRADED
// ==============================

import { useState, useMemo } from "react";

// ==============================
// CORE STYLE
// ==============================

const IEQ = {
  navy: "#0F1D4A",
  gold: "#B8945F",
  white: "#FFFFFF",
  offWhite: "#F8F7F4",
  text: "#1A1A2E",
  lightText: "#6B6B7A",
  border: "#E0DDD6",
  success: "#2D7A4F",
  danger: "#9B3B3B",
  warning: "#B8860B",
};

// ==============================
// DEFAULT STATE (ENHANCED)
// ==============================

const defaultState = {
  age: 70,
  retirementAge: 75,
  planToAge: 95,

  liquidAssets: 450000,
  preTax: 600000,
  taxable: 200000,

  monthlyIncome: 8000,
  monthlyExpenses: 7000,

  expectedReturn: 5,
  inflation: 3,

  // NEW — liquidity framework
  liquidityThreshold: 300000,
  annualCapitalCalls: 100000,

  // scenario
  scenarioHome: 0,
};

// ==============================
// FORMAT
// ==============================

const fmt = (n) => {
  if (!n) return "$0";
  if (Math.abs(n) > 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) > 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

// ==============================
// ENGINE (SIMPLIFIED + IMPROVED)
// ==============================

function runModel(p) {
  const years = p.planToAge - p.age;

  let liquid = p.liquidAssets;
  let preTax = p.preTax;
  let taxable = p.taxable;

  let minBalance = liquid;
  let breachAge = null;

  const projection = [];

  for (let i = 0; i <= years; i++) {
    const age = p.age + i;

    const growth = (p.expectedReturn - p.inflation) / 100;

    const income = age < p.retirementAge ? p.monthlyIncome * 12 : 0;
    const expenses = p.monthlyExpenses * 12 * Math.pow(1 + p.inflation / 100, i);

    const capitalCall = p.annualCapitalCalls;

    // growth
    liquid *= 1 + growth;

    // flows
    liquid += income - expenses - capitalCall;

    if (i === 1 && p.scenarioHome > 0) {
      liquid -= p.scenarioHome;
    }

    if (liquid < minBalance) minBalance = liquid;

    if (!breachAge && liquid < p.liquidityThreshold) {
      breachAge = age;
    }

    projection.push({ age, liquid });
  }

  const runwayMonths = p.monthlyExpenses > 0
    ? liquid / p.monthlyExpenses
    : 999;

  const stressRunway = p.monthlyExpenses > 0
    ? (liquid - p.annualCapitalCalls) / p.monthlyExpenses
    : 999;

  return {
    projection,
    finalBalance: liquid,
    minBalance,
    breachAge,
    runwayMonths,
    stressRunway,
    liquidityRatio: liquid / (liquid + preTax + taxable),
  };
}

// ==============================
// MAIN APP
// ==============================

export default function App() {
  const [p, setP] = useState(defaultState);

  const model = useMemo(() => runModel(p), [p]);

  const update = (k, v) => setP(prev => ({ ...prev, [k]: v }));

  return (
    <div style={{ padding: 30, background: IEQ.offWhite, minHeight: "100vh" }}>

      <h1 style={{ fontFamily: "Georgia", color: IEQ.navy }}>
        IEQ Financial Command Center
      </h1>

      {/* ==============================
         EXECUTIVE SUMMARY
      ============================== */}

      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>

        <Card label="Liquid Assets" value={fmt(p.liquidAssets)} />

        <Card
          label="Liquidity Ratio"
          value={`${(model.liquidityRatio * 100).toFixed(1)}%`}
        />

        <Card
          label="Runway"
          value={`${Math.round(model.runwayMonths)} mo`}
        />

        <Card
          label="Stress Runway"
          value={`${Math.round(model.stressRunway)} mo`}
          color={model.stressRunway < 12 ? IEQ.danger : IEQ.navy}
        />
      </div>

      {/* ==============================
         RISK FLAGS
      ============================== */}

      <div style={{ marginTop: 30 }}>

        {model.breachAge && (
          <Alert
            type="danger"
            text={`Liquidity falls below threshold at age ${model.breachAge}`}
          />
        )}

        {model.minBalance < 0 && (
          <Alert
            type="danger"
            text={`Negative balance projected — plan not sustainable`}
          />
        )}

        {model.stressRunway < 12 && (
          <Alert
            type="warning"
            text="Capital call stress reduces runway below 12 months"
          />
        )}
      </div>

      {/* ==============================
         CONTROLS
      ============================== */}

      <div style={{ marginTop: 30 }}>

        <Input
          label="Monthly Income"
          value={p.monthlyIncome}
          onChange={(v) => update("monthlyIncome", v)}
        />

        <Input
          label="Monthly Expenses"
          value={p.monthlyExpenses}
          onChange={(v) => update("monthlyExpenses", v)}
        />

        <Input
          label="Liquidity Threshold"
          value={p.liquidityThreshold}
          onChange={(v) => update("liquidityThreshold", v)}
        />

        <Input
          label="Annual Capital Calls"
          value={p.annualCapitalCalls}
          onChange={(v) => update("annualCapitalCalls", v)}
        />

        <Input
          label="Home Purchase Scenario"
          value={p.scenarioHome}
          onChange={(v) => update("scenarioHome", v)}
        />
      </div>

    </div>
  );
}

// ==============================
// COMPONENTS
// ==============================

function Card({ label, value, color }) {
  return (
    <div style={{
      background: IEQ.white,
      padding: 20,
      border: `1px solid ${IEQ.border}`,
      borderRadius: 6,
      minWidth: 160
    }}>
      <div style={{ fontSize: 11, color: IEQ.lightText }}>{label}</div>
      <div style={{
        fontSize: 24,
        color: color || IEQ.navy,
        fontFamily: "Georgia"
      }}>
        {value}
      </div>
    </div>
  );
}

function Alert({ type, text }) {
  const color = type === "danger" ? IEQ.danger : IEQ.warning;
  return (
    <div style={{
      padding: 12,
      borderLeft: `3px solid ${color}`,
      background: "#fff",
      marginBottom: 10
    }}>
      {text}
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ padding: 6, width: 200 }}
      />
    </div>
  );
}
