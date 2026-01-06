// MadraCalculatorLayout.tsx
// Drop this into any React app (Next.js or Vite). No dependencies.
// It’s just the UI + a stub “simulate()” you’ll replace later.
"use client";

import React, { useMemo, useState } from "react";

type Direction = "Inward" | "Balanced" | "Outward";
type Context = "Resting" | "Moving" | "Fighting";
type EnvMode = "Preset (Books)" | "Custom";

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
  | "Pure";

type PathPreset = {
  id: string;
  name: string;
  coreTypes: AuraType[];
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
  "Pure",
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

// Simple compatibility score: sum of env weights for your path’s types.
// (You can replace with dot product / cosine similarity later.)
function computeMatchScore(envComp: Partial<Record<AuraType, number>>, coreTypes: AuraType[]) {
  let score = 0;
  for (const t of coreTypes) score += envComp[t] ?? 0;
  return clamp01(score);
}

function formatPct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function format1(x: number) {
  return (Math.round(x * 10) / 10).toFixed(1);
}

type SimPoint = { t: number; reserve: number; capacity: number; strain: number };

function simulateStub(args: {
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
  // This is NOT “the model” yet.
  // It’s just a placeholder to prove the UI works.
  // Replace this entire function with your real time-stepping later.

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
  let K = Math.max(1, initialCapacity);
  let M = clamp01(initialReservePct) * K;
  let D = 0;

  // crude knobs so curves move
  const dirIn = direction === "Inward" ? 1 : direction === "Balanced" ? 0.6 : 0.35;
  const dirOut = direction === "Outward" ? 1 : direction === "Balanced" ? 0.5 : 0.1;

  const contextUptime = context === "Resting" ? 1 : context === "Moving" ? 0.7 : 0.45;
  const easeUptime = 0.35 + 0.65 * ease; // easy -> higher uptime
  const uptime = clamp01(contextUptime * easeUptime);

  const I0 = 8; // base intake scale (arb units/min)
  const intakeCeiling = I0 * density * (1 - 0.7 * ease); // easy -> lower ceiling
  const matchEff = 0.15 + 0.85 * match; // mismatch still nonzero

  const points: SimPoint[] = [];

  while (t <= durationMin + 1e-9) {
    points.push({ t, reserve: M, capacity: K, strain: D });

    // placeholder dynamics
    const rawIntake = uptake(intakeCeiling, M, K, matchEff) * uptime;

    const dMdt = rawIntake * dirIn - 0.01 * M - 0.03 * D * (M / K);
    const dKdt = 0.02 * rawIntake * dirOut * (1 - ease) * (1 - K / (K + 500)); // asymptotic-ish
    const dDdt = 0.04 * rawIntake * (1 - ease) + 0.02 * (1 - match) * rawIntake - 0.06 * D;

    M = Math.max(0, Math.min(K, M + dMdt * dtMin));
    K = Math.max(1, K + dKdt * dtMin);
    D = Math.max(0, D + dDdt * dtMin);

    t += dtMin;
  }

  return points;

  function uptake(ceiling: number, m: number, k: number, eff: number) {
    // slows down as you approach full
    const fullness = k > 0 ? m / k : 0;
    const sat = Math.max(0, 1 - fullness);
    return Math.max(0, ceiling * eff * sat);
  }
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
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
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
  const [initialCapacity, setInitialCapacity] = useState(100); // arb units

  const [direction, setDirection] = useState<Direction>("Inward");
  const [ease, setEase] = useState(0.6); // 0..1 easy
  const [context, setContext] = useState<Context>("Resting");

  // Environment
  const [envMode, setEnvMode] = useState<EnvMode>("Preset (Books)");
  const [envId, setEnvId] = useState(ENVS[0].id);

  const envPreset = useMemo(() => ENVS.find((e) => e.id === envId) ?? ENVS[0], [envId]);

  const [customDensity, setCustomDensity] = useState(0.5);
  const [customComp, setCustomComp] = useState<Record<AuraType, number>>(() => {
    // default: evenly spread across a few
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
    return simulateStub({
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
    <div style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 18 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Math of Twin Stars</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>Calculator layout (UI + stub sim). Replace the stub with your real model.</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, textAlign: "right" }}>
            Environment match: <b>{formatPct(match)}</b> · Aura density: <b>{formatPct(effectiveEnv.density)}</b>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, alignItems: "start" }}>
          {/* Controls */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontWeight: 750, marginBottom: 2 }}>Inputs</div>

            <Field label="Path" hint="Core types determine environment match">
              <select value={pathId} onChange={(e) => setPathId(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
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
              />
            </Field>

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb" }} />

            <Field label="Directional cycling" hint="Inward = reserve, Outward = capacity">
              <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
                {(["Inward", "Balanced", "Outward"] as Direction[]).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ease" hint={`Easy: ${formatPct(ease)} (easy => lower ceiling, higher uptime)`}>
              <input type="range" min={0} max={1} step={0.01} value={ease} onChange={(e) => setEase(Number(e.target.value))} />
            </Field>

            <Field label="Context" hint="Affects uptime">
              <select value={context} onChange={(e) => setContext(e.target.value as Context)} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
                {(["Resting", "Moving", "Fighting"] as Context[]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb" }} />

            <Field label="Environment mode">
              <select value={envMode} onChange={(e) => setEnvMode(e.target.value as EnvMode)} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
                {(["Preset (Books)", "Custom"] as EnvMode[]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>

            {envMode === "Preset (Books)" ? (
              <Field label="Environment (Books)" hint={effectiveEnv.name}>
                <select value={envId} onChange={(e) => setEnvId(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
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
                  <input type="range" min={0} max={1} step={0.01} value={customDensity} onChange={(e) => setCustomDensity(Number(e.target.value))} />
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
                      />
                      <div style={{ fontSize: 12, textAlign: "right", opacity: 0.8 }}>{Math.round(customComp[t] * 100)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb" }} />

            <Field label="Duration (minutes)" hint={`${durationMin} min`}>
              <input type="range" min={10} max={360} step={5} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
            </Field>

            <Field label="Time step dt (minutes)" hint={`dt = ${dtMin}`}>
              <input type="range" min={0.1} max={2} step={0.1} value={dtMin} onChange={(e) => setDtMin(Number(e.target.value))} />
            </Field>
          </div>

          {/* Outputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Final reserve</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{format1(final.reserve)}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Fullness: {formatPct(fullness)}</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Final capacity</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{format1(final.capacity)}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>ΔK: {format1(final.capacity - initialCapacity)}</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Final strain</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{format1(final.strain)}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Lower is better</div>
              </div>
            </div>

            <SimpleSparkline data={reserveSeries} label="Reserve (M) over time" />
            <SimpleSparkline data={capacitySeries} label="Capacity (K) over time" />
            <SimpleSparkline data={strainSeries} label="Strain (D) over time" />

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
              <b>Notes</b>
              <ul style={{ margin: "8px 0 0 18px" }}>
                <li>This is a layout + placeholder simulation so you can wire the UI first.</li>
                <li>Replace <code>simulateStub()</code> with your real time-stepping rules once you study the basics.</li>
                <li>Keep internal units arbitrary. Use percent/fullness for intuition.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
