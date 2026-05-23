import { useMemo, useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useVisualizer } from "./VisualizerContext";
import { varColor } from "@/lib/csv";
import { SectionTitle, NoData } from "./OverviewPanel";

export function MergeStepsPanel() {
  const { variants } = useVisualizer();
  const keys = Object.keys(variants);

  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [stepRange, setStepRange] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");

  // auto-select first variant
  const activeVariant = selectedVariant && variants[selectedVariant]
    ? selectedVariant
    : keys.includes("Sequential") ? "Sequential" : keys[0] || "";

  const data = variants[activeVariant] || [];
  const maxSteps = data.length;
  const rows = useMemo(() => {
    let filtered = data.slice(0, stepRange);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = data
        .filter((r) =>
          (r.pair_a + "" + r.pair_b).toLowerCase().includes(q),
        )
        .slice(0, 100);
    }
    return filtered;
  }, [data, stepRange, searchQuery]);

  const maxFreq = useMemo(
    () => Math.max(...rows.map((r) => r.freq || 0), 1),
    [rows],
  );

  // Per-step wall time chart data
  const stepTimeData = useMemo(
    () => data.slice(0, stepRange).map((r) => ({ step: r.step, wall_ms: r.wall_ms || 0 })),
    [data, stepRange],
  );

  // Freq decay chart: all variants overlaid
  const freqDecayData = useMemo(() => {
    const maxLen = Math.max(...keys.map((k) => Math.min(variants[k].length, stepRange)));
    const out: Record<string, number | string>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, number | string> = { step: i + 1 };
      keys.forEach((k) => {
        const d = variants[k];
        if (i < d.length && i < stepRange) row[k] = d[i].freq || 0;
      });
      out.push(row);
    }
    return out;
  }, [variants, keys, stepRange]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SectionTitle>BPE Merge Explorer</SectionTitle>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={activeVariant}
          onChange={(e) => setSelectedVariant(e.target.value)}
          className="bg-[var(--surface-2)] border border-border text-foreground rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--seq)] flex-1 min-w-[160px]"
        >
          <option value="">— Select variant —</option>
          {keys.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search pair (e.g. 'th', 'e r')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-[var(--surface-2)] border border-border text-foreground rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--seq)] flex-1 min-w-[140px]"
        />
        <button
          onClick={() => setSearchQuery(searchQuery)}
          className="bg-[var(--seq)] text-white border-none px-5 py-2 rounded font-display text-xs font-bold uppercase tracking-wider hover:opacity-85 transition-opacity whitespace-nowrap"
        >
          Search
        </button>
      </div>

      {/* Step range slider */}
      <div className="flex items-center gap-4 bg-[var(--surface-2)] border border-border rounded-md px-4 py-3">
        <label className="text-[11px] text-muted-foreground whitespace-nowrap">Step range:</label>
        <input
          type="range"
          min={1}
          max={maxSteps || 500}
          value={stepRange}
          onChange={(e) => setStepRange(parseInt(e.target.value))}
          className="flex-1 accent-[var(--seq)]"
        />
        <span className="font-display text-base font-extrabold text-[var(--seq)] min-w-[40px] text-right">
          {stepRange}
        </span>
        <span className="text-[11px] text-muted-foreground">/ {maxSteps || "—"}</span>
      </div>

      {/* Main content grid */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Merge feed */}
        <div>
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-2">
            Merge Sequence (first {rows.length} steps)
          </div>
          <div className="border border-border rounded-md bg-[var(--surface-2)] max-h-[240px] overflow-y-auto">
            {rows.length > 0 ? (
              rows.map((r) => {
                const merged = (r.pair_a || "") + (r.pair_b || "");
                const barW = ((r.freq || 0) / maxFreq) * 60;
                return (
                  <div
                    key={r.step}
                    className={`flex items-center gap-3 px-3.5 py-2 border-b border-[#151c2a] hover:bg-[#1a2035] transition-colors cursor-pointer ${
                      searchQuery ? "bg-[#1e2a40]" : ""
                    }`}
                  >
                    <span className="text-muted-foreground text-[10px] min-w-[36px]">
                      {r.step}
                    </span>
                    <span className="flex-1">
                      <span className="font-mono text-[11px] bg-[#1e2535] px-1.5 py-0.5 rounded">{r.pair_a}</span>
                      <span className="text-[var(--seq)] mx-1.5">+</span>
                      <span className="font-mono text-[11px] bg-[#1e2535] px-1.5 py-0.5 rounded">{r.pair_b}</span>
                      <span className="text-[var(--seq)] mx-1.5">→</span>
                      <span className="font-mono text-[11px] bg-[#1e2535] px-1.5 py-0.5 rounded text-[#4c8ef5]">{merged}</span>
                      <div
                        className="h-[3px] rounded mt-1 bg-[var(--seq)] opacity-60"
                        style={{ width: `${barW}px` }}
                      />
                    </span>
                    <span className="text-muted-foreground text-[11px] text-right min-w-[60px]">
                      {(r.freq || 0).toLocaleString()}
                    </span>
                  </div>
                );
              })
            ) : (
              <NoData icon="📋" text="Load and select a variant to browse merges" />
            )}
          </div>
        </div>

        {/* Per-step wall time chart */}
        <div>
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-2">
            Per-Step Wall Time
          </div>
          <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stepTimeData} margin={{ top: 10, right: 16, bottom: 20, left: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis
                  dataKey="step"
                  tick={{ fill: "#5a6585", fontSize: 10 }}
                  label={{ value: "step", position: "insideBottom", offset: -10, fill: "#3a445a", fontSize: 10 }}
                />
                <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="wall_ms"
                  stroke={varColor(activeVariant)}
                  fill={varColor(activeVariant)}
                  fillOpacity={0.1}
                  strokeWidth={1.8}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Freq decay chart */}
      <div>
        <SectionTitle>Merge Frequency Decay</SectionTitle>
        <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={freqDecayData} margin={{ top: 10, right: 16, bottom: 20, left: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis
                dataKey="step"
                tick={{ fill: "#5a6585", fontSize: 10 }}
                label={{ value: "step", position: "insideBottom", offset: -10, fill: "#3a445a", fontSize: 10 }}
              />
              <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="plainline" />
              {keys.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={varColor(k)}
                  strokeWidth={1.5}
                  dot={false}
                  strokeOpacity={0.75}
                  name={k}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
