// MadraCalculatorLayout.tsx
"use client";

import React, { useMemo, useState } from "react";

const selectStyle: React.CSSProperties = {
  backgroundColor: "#0b0b0b",
  color: "#f9fafb",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: 10,
};

type Direction = "Inward" | "Balanced" | "Outward";
type Context = "Resting" | "Moving" | "Fighting";
type EnvMode = "Preset (Books)" | "Custom";

// Aura that exists in the environment
type AuraType =
  | "Fire"
  | "Water"
  | "Earth"
  | "Wind"
  | "Shadow"
  | "Light"
  | "Sword"
  | "Force"
  | "Dream"
  | "Destruction"
  | "Death";

// Madra that can exist in a core (includes Pure madra, but Pure aura does not exist)
type MadraType = AuraType | "Pure";

type PathPreset = {
  id: string;
  name: string;
  coreTypes: MadraType[];
};

type EnvPreset = {
  id: string;
  name: string;
  density: number; // 0..1
  composition: Partial<Record<AuraType, number>>; // weights sum ~ 1
};

const PATHS: PathPreset[] = [
  { id: "twin-stars", name: "Twin Stars (Pure + Destruction)", coreTypes: ["Pure", "Destruction"] },
  { id: "blackflame", name: "Blackflame (Fire + Destruction)", coreTypes: ["Fire", "Destruction"] },
  { id: "shadow", name: "Shadow Path (Shadow)", coreTypes: ["Shadow"] },
  { id: "sword", name: "Sword Path (Sword)", coreTypes: ["Sword"] },
];

const ENVS: EnvPreset[] = [
  {
    id: "sacred-valley",
    name: "Sacred Valley (Low density)",
    density: 0.15,
    composition: { Earth: 0.35, Wind: 0.25, Water: 0.2, Light: 0.2 },
  },
  {
    id: "night-wheel",
    name: "Night Wheel Valley (High shadow density)",
    density: 0.85,
    composition: { Shadow: 0.7, Dream: 0.2, Wind: 0.1 },
  },
  {
    id: "average-wilds",
    name: "Average wilderness",
    density: 0.5,
    composition: { Earth: 0.3, Wind: 0.25, Water: 0.2, Fire: 0.15, Light: 0.1 },
  },
];

const AURA_TYPES: AuraType[] = [
  "Fire",
  "Water",
  "Earth",
  "Wind",
  "Shadow",
  "Light",
  "Sword",
  "Force",
  "Dream",
  "Destruction",
  "Death",
];

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function normalizeComposition(comp: Record<string, number>) {
  const sum = Object.values(comp).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (sum <= 0) return comp;
  const out: Record<string, number> = {};
  for (const k of Object.keys(comp)) out[k] = comp[k] / sum;
  return out;
}

// Compatibility score: sum of environment aura weights matching the path's non-Pure types,
// plus a small baseline for Pure madra (since Pure aura does not exist).
function computeMatchScore(
  envComp: Partial<Record<AuraType, number>>,
  coreTypes: MadraType[]
) {
  let score = 0;

  for (const t of coreTypes) {
    if (t === "Pure") score += 0.05; // neutral baseline, never "perfect"
    else score += envComp[t] ?? 0;
  }

  return clamp01(score);
}

function formatPct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function format1(x: number) {
  return (Math.round(x * 10) / 10).toFixed(1);
}

type SimPoint = { t: number; reserve: number; capacity: number; strain: number };

// v0.1: reserve-only dynamics (capacity fixed). Strain is kept as a placeholder output = 0.
function simulate(args: {
  durationMin: number;
  dtMin: number;
  initialReservePct: number;
  initialCapacity: number;
  direction: Direction;
  ease: number; // 0..1 (1 easy)
  density: number; // 0..1
  match: number; // 0..1
  context: Context;
}): SimPoint[] {
  const {
    durationMin,
    dtMin,
    initialReservePct,
    initialCapacity,
    direction,
    ease,
    density,
    match,
    context,
  } = args;

  let t = 0;
  const K = Math.max(1, initialCapacity);
  let M = Math.max(0, Math.min(K, clamp01(initialReservePct) * K));
  const D = 0;

  // --- tunable constants (arb units/min) ---
  const BASE_INTAKE = 10;
  const LOSS_RATE = 0.01;

  // Direction multiplier (reserve-focused cycling)
  const dirMult =
    direction === "Inward" ? 1.0 :
    direction === "Balanced" ? 0.7 :
    0.4;

  // Context multiplier (how much you can actually cycle)
  const contextUptime =
    context === "Resting" ? 1.0 :
    context === "Moving" ? 0.7 :
    0.45;

  // Ease: easy = higher uptime, lower ceiling
  const e = clamp01(ease);
  const easeUptime = 0.35 + 0.65 * e;
  const uptime = clamp01(contextUptime * easeUptime);

  const matchEff = 0.15 + 0.85 * clamp01(match);
  const easeCeilingMult = 1 - 0.7 * e;

  const ceiling =
    BASE_INTAKE *
    clamp01(density) *
    matchEff *
    dirMult *
    easeCeilingMult;

  const points: SimPoint[] = [];

  while (t <= durationMin + 1e-9) {
    points.push({ t, reserve: M, capacity: K, strain: D });

    const fullness = K > 0 ? M / K : 0;

    // Regen slows near full
    const regen = uptime * ceiling * Math.max(0, 1 - fullness);

    // Passive loss so it doesn't asymptote to exactly K
    const loss = LOSS_RATE * M;

    const dMdt = regen - loss;

    M = Math.max(0, Math.min(K, M + dMdt * dtMin));
    t += dtMin;
  }

  return points;
}

function SimpleSparkline({
  data,
  width = 680,
  height = 180,
  label,
}: {
  data: number[];
  width?: number;
  height?: number;
  label: string;
}) {
  const pad = 10;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const pts = data
    .map((y, i) => {
      const x = pad + (i / Math.max(1, data.length - 1)) * w;
      const yy = pad + (1 - (y - min) / span) * h;
      return `${x},${yy}`;
    })
    .join(" ");

  return (
    <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 12, background: "#0b0b0b" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 650 }}>{label}</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          min {format1(min)} · max {format1(max)}
        </div>
      </div>
      <svg width={width} height={height} style={{ display: "block" }}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} opacity={0.9} />
      </svg>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint ? <div style={{ fontSize: 12, opacity: 0.7 }}>{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

export default function MadraCalculatorLayout() {
  // Character / technique
  const [pathId, setPathId] = useState(PATHS[0].id);
  const path = useMemo(() => PATHS.find((p) => p.id === pathId) ?? PATHS[0], [pathId]);

  const [initialReservePct, setInitialReservePct] = useState(0.35);
  const [initialCapacity, setInitialCapacity] = useState(100);

  const [direction, setDirection] = useState<Direction>("Inward");
  const [ease, setEase] = useState(0.6);
  const [context, setContext] = useState<Context>("Resting");

  // Environment
  const [envMode, setEnvMode] = useState<EnvMode>("Preset (Books)");
  const [envId, setEnvId] = useState(ENVS[0].id);
  const envPreset = useMemo(() => ENVS.find((e) => e.id === envId) ?? ENVS[0], [envId]);

  const [customDensity, setCustomDensity] = useState(0.5);
  const [customComp, setCustomComp] = useState<Record<AuraType, number>>(() => {
    const base: Record<AuraType, number> = Object.fromEntries(AURA_TYPES.map((t) => [t, 0])) as any;
    base.Earth = 0.3;
    base.Wind = 0.25;
    base.Water = 0.2;
    base.Fire = 0.15;
    base.Light = 0.1;
    return normalizeComposition(base) as Record<AuraType, number>;
  });

  // Simulation
  const [durationMin, setDurationMin] = useState(120);
  const [dtMin, setDtMin] = useState(0.5);

  const effectiveEnv = useMemo(() => {
    if (envMode === "Preset (Books)") {
      return { density: envPreset.density, composition: envPreset.composition, name: envPreset.name };
    }
    const compNorm = normalizeComposition(customComp) as Record<AuraType, number>;
    const partial: Partial<Record<AuraType, number>> = {};
    for (const t of AURA_TYPES) partial[t] = compNorm[t];
    return { density: customDensity, composition: partial, name: "Custom environment" };
  }, [envMode, envPreset, customDensity, customComp]);

  const match = useMemo(
    () => computeMatchScore(effectiveEnv.composition, path.coreTypes),
    [effectiveEnv.composition, path.coreTypes]
  );

  const sim = useMemo(() => {
    return simulate({
      durationMin,
      dtMin,
      initialReservePct,
      initialCapacity,
      direction,
      ease,
      density: effectiveEnv.density,
      match,
      context,
    });
  }, [
    durationMin,
    dtMin,
    initialReservePct,
    initialCapacity,
    direction,
    ease,
    effectiveEnv.density,
    match,
    context,
  ]);

  const reserveSeries = sim.map((p) => p.reserve);
  const capacitySeries = sim.map((p) => p.capacity);
  const strainSeries = sim.map((p) => p.strain);

  const final = sim[sim.length - 1];
  const fullness = final.capacity > 0 ? final.reserve / final.capacity : 0;

  return (
    <div
      style={{
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
        padding: 18,
        backgroundColor: "#050505",
        color: "#f9fafb",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Math of Twin Stars</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>Calculator layout + v0.1 reserve model (Pure madra, no Pure aura).</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, textAlign: "right" }}>
            Environment match: <b>{formatPct(match)}</b> · Aura density: <b>{formatPct(effectiveEnv.density)}</b>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, alignItems: "start" }}>
          {/* Controls */}
          <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 14, background: "#0b0b0b" }}>
            <div style={{ fontWeight: 750, marginBottom: 2 }}>Inputs</div>

            <Field label="Path" hint="Core types determine environment match">
              <select value={pathId} onChange={(e) => setPathId(e.target.value)} style={selectStyle}>
                {PATHS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Core types: <b>{path.coreTypes.join(" + ")}</b>
              </div>
            </Field>

            <Field label="Initial reserve" hint={`Currently: ${formatPct(initialReservePct)}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={initialReservePct}
                onChange={(e) => setInitialReservePct(Number(e.target.value))}
                style={{ accentColor: "#9ca3af" }}
              />
            </Field>

            <Field label="Initial capacity (arb. units)" hint={`K₀ = ${initialCapacity}`}>
              <input
                type="range"
                min={10}
                max={500}
                step={5}
                value={initialCapacity}
                onChange={(e) => setInitialCapacity(Number(e.target.value))}
                style={{ accentColor: "#9ca3af" }}
              />
            </Field>

            <hr style={{ border: "none", borderTop: "1px solid #1f2937" }} />

            <Field label="Directional cycling" hint="Inward = reserve-focused, Outward = low reserve regen">
              <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} style={selectStyle}>
                {(["Inward", "Balanced", "Outward"] as Direction[]).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ease" hint={`Easy: ${formatPct(ease)} (easy => lower ceiling, higher uptime)`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={ease}
                onChange={(e) => setEase(Number(e.target.value))}
                style={{ accentColor: "#9ca3af" }}
              />
            </Field>

            <Field label="Context" hint="Affects uptime">
              <select value={context} onChange={(e) => setContext(e.target.value as Context)} style={selectStyle}>
                {(["Resting", "Moving", "Fighting"] as Context[]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <hr style={{ border: "none", borderTop: "1px solid #1f2937" }} />

            <Field label="Environment mode">
              <select value={envMode} onChange={(e) => setEnvMode(e.target.value as EnvMode)} style={selectStyle}>
                {(["Preset (Books)", "Custom"] as EnvMode[]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>

            {envMode === "Preset (Books)" ? (
              <Field label="Environment (Books)" hint={effectiveEnv.name}>
                <select value={envId} onChange={(e) => setEnvId(e.target.value)} style={selectStyle}>
                  {ENVS.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Aura density" hint={formatPct(customDensity)}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={customDensity}
                    onChange={(e) => setCustomDensity(Number(e.target.value))}
                    style={{ accentColor: "#9ca3af" }}
                  />
                </Field>

                <div style={{ fontWeight: 650, marginTop: 6 }}>Aura composition</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: -8 }}>
                  Sliders auto-normalize. Only a few need to be nonzero.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                  {AURA_TYPES.map((t) => (
                    <div key={t} style={{ display: "grid", gridTemplateColumns: "90px 1fr 48px", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{t}</div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={customComp[t]}
                        onChange={(e) => {
                          const next = { ...customComp, [t]: Number(e.target.value) } as Record<AuraType, number>;
                          const norm = normalizeComposition(next) as Record<AuraType, number>;
                          setCustomComp(norm);
                        }}
                        style={{ accentColor: "#9ca3af" }}
                      />
                      <div style={{ fontSize: 12, textAlign: "right", opacity: 0.8 }}>{Math.round(customComp[t] * 100)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <hr style={{ border: "none", borderTop: "1px solid #1f2937" }} />

            <Field label="Duration (minutes)" hint={`${durationMin} min`}>
              <input
                type="range"
                min={10}
                max={360}
                step={5}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                style={{ accentColor: "#9ca3af" }}
              />
            </Field>

            <Field label="Time step dt (minutes)" hint={`dt = ${dtMin}`}>
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.1}
                value={dtMin}
                onChange={(e) => setDtMin(Number(e.target.value))}
                style={{ accentColor: "#9ca3af" }}
              />
            </Field>
          </div>

          {/* Outputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 12, background: "#0b0b0b" }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Final reserve</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{format1(final.reserve)}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Fullness: {formatPct(fullness)}</div>
              </div>
              <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 12, background: "#0b0b0b" }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Capacity</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{format1(final.capacity)}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Fixed in v0.1</div>
              </div>
              <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 12, background: "#0b0b0b" }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Strain</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{format1(final.strain)}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Not modeled in v0.1</div>
              </div>
            </div>

            <SimpleSparkline data={reserveSeries} label="Reserve (M) over time" />
            <SimpleSparkline data={capacitySeries} label="Capacity (K) over time" />
            <SimpleSparkline data={strainSeries} label="Strain (D) over time" />

            <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 12, fontSize: 13, opacity: 0.9, lineHeight: 1.5, background: "#0b0b0b" }}>
              <b>Notes</b>
              <ul style={{ margin: "8px 0 0 18px" }}>
                <li>Pure aura is excluded by design; only Pure madra exists.</li>
                <li>v0.1 models reserve regeneration with saturation near capacity.</li>
                <li>Next: add strain (D) feedback or capacity growth (K(t)), but not both at once.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
