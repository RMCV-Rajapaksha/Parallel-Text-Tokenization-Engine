import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { useVisualizer, getPercentile } from "./VisualizerContext";
import { varColor } from "@/lib/csv";
import { SectionTitle, NoData } from "./OverviewPanel";

export function PerformancePanel() {
  const { variants } = useVisualizer();
  const keys = Object.keys(variants);

  // ── OMP Scaling ──
  const ompChart = useMemo(() => {
    const ompKeys = keys.filter((k) => k.startsWith("OMP")).sort(
      (a, b) => parseInt(a.match(/\d+/)?.[0] || "0") - parseInt(b.match(/\d+/)?.[0] || "0"),
    );
    if (ompKeys.length < 2) return null;
    const t1 = variants[ompKeys[0]].reduce((s, r) => s + (r.wall_ms || 0), 0);
    const threads = ompKeys.map((k) => parseInt(k.match(/\d+/)?.[0] || "1"));
    return threads.map((t, i) => ({
      threads: t,
      actual: +(t1 / variants[ompKeys[i]].reduce((s, r) => s + (r.wall_ms || 0), 0)).toFixed(2),
      ideal: +(t / threads[0]).toFixed(2),
    }));
  }, [variants, keys]);

  // ── MPI Scaling ──
  const mpiChart = useMemo(() => {
    const mpiKeys = keys.filter((k) => k.startsWith("MPI-")).sort(
      (a, b) => parseInt(a.match(/\d+/)?.[0] || "0") - parseInt(b.match(/\d+/)?.[0] || "0"),
    );
    if (mpiKeys.length < 2) return null;
    const t1 = variants[mpiKeys[0]].reduce((s, r) => s + (r.wall_ms || 0), 0);
    const procs = mpiKeys.map((k) => parseInt(k.match(/\d+/)?.[0] || "1"));
    return procs.map((p, i) => ({
      procs: p,
      actual: +(t1 / variants[mpiKeys[i]].reduce((s, r) => s + (r.wall_ms || 0), 0)).toFixed(2),
      ideal: +(p / procs[0]).toFixed(2),
    }));
  }, [variants, keys]);

  // ── P50 Bar ──
  const p50Data = useMemo(() => {
    return keys.map((k) => {
      const ms = variants[k].map((r) => r.wall_ms || 0);
      return { label: k, p50: +getPercentile(ms, 0.5).toFixed(3) };
    });
  }, [variants, keys]);

  // ── Summary Table ──
  const summaryRows = useMemo(() => {
    const seqData = variants["Sequential"];
    const seqTotal = seqData?.reduce((s, r) => s + (r.wall_ms || 0), 0) ?? null;
    return keys.map((k) => {
      const d = variants[k];
      const ms = d.map((r) => r.wall_ms || 0).sort((a, b) => a - b);
      const total = ms.reduce((s, v) => s + v, 0);
      const mean = total / ms.length;
      const p50 = ms[Math.floor(ms.length * 0.5)] ?? 0;
      const p95 = ms[Math.floor(ms.length * 0.95)] ?? 0;
      const sp = seqTotal ? seqTotal / total : 1;
      return { variant: k, steps: d.length, total, mean, p50, p95, sp };
    });
  }, [variants, keys]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SectionTitle>Performance Benchmarks</SectionTitle>

      {/* Scaling charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* OMP */}
        <div>
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-2">
            OpenMP Thread Scaling
          </div>
          <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
            {ompChart ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={ompChart} margin={{ top: 10, right: 16, bottom: 20, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                  <XAxis
                    dataKey="threads"
                    tick={{ fill: "#5a6585", fontSize: 10 }}
                    label={{ value: "threads", position: "insideBottom", offset: -10, fill: "#3a445a", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="plainline" />
                  <Line type="monotone" dataKey="actual" stroke="#f5a623" strokeWidth={2.5} name="Actual" dot={{ fill: "#f5a623", r: 3 }} />
                  <Line type="monotone" dataKey="ideal" stroke="#3a4455" strokeWidth={1.5} strokeDasharray="5 5" name="Ideal" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <NoData icon="📊" text="Need ≥2 OMP-*t variants" />
            )}
          </div>
        </div>

        {/* MPI */}
        <div>
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-2">
            MPI Process Scaling
          </div>
          <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
            {mpiChart ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={mpiChart} margin={{ top: 10, right: 16, bottom: 20, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                  <XAxis
                    dataKey="procs"
                    tick={{ fill: "#5a6585", fontSize: 10 }}
                    label={{ value: "processes", position: "insideBottom", offset: -10, fill: "#3a445a", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="plainline" />
                  <Line type="monotone" dataKey="actual" stroke="#4caf7d" strokeWidth={2.5} name="Actual" dot={{ fill: "#4caf7d", r: 3 }} />
                  <Line type="monotone" dataKey="ideal" stroke="#3a4455" strokeWidth={1.5} strokeDasharray="5 5" name="Ideal" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <NoData icon="📊" text="Need ≥2 MPI-*p variants" />
            )}
          </div>
        </div>
      </div>

      {/* P50 bar chart */}
      <SectionTitle>Per-Step Time Distribution (P50)</SectionTitle>
      <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
        {p50Data.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={p50Data} margin={{ top: 16, right: 16, bottom: 30, left: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#5a6585", fontSize: 10 }}
                interval={0}
                angle={-30}
                textAnchor="end"
              />
              <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="p50" radius={[3, 3, 0, 0]} label={{ position: "top", fill: "#fff", fontSize: 10 }}>
                {p50Data.map((d, i) => (
                  <Cell key={i} fill={varColor(d.label)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <NoData icon="📊" text="Load data" />
        )}
      </div>

      {/* Summary table */}
      <SectionTitle>Summary Table</SectionTitle>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 border-b border-border">Variant</th>
              <th className="px-3 py-2.5 border-b border-border">Steps</th>
              <th className="px-3 py-2.5 border-b border-border">Total (s)</th>
              <th className="px-3 py-2.5 border-b border-border">Mean ms/step</th>
              <th className="px-3 py-2.5 border-b border-border">P50 ms</th>
              <th className="px-3 py-2.5 border-b border-border">P95 ms</th>
              <th className="px-3 py-2.5 border-b border-border">Speedup</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.length > 0 ? (
              summaryRows.map((r) => (
                <tr key={r.variant} className="hover:bg-[#151c2a] transition-colors">
                  <td className="px-3 py-2 border-b border-[#1a2030] font-bold">{r.variant}</td>
                  <td className="px-3 py-2 border-b border-[#1a2030]">{r.steps}</td>
                  <td className="px-3 py-2 border-b border-[#1a2030]">{(r.total / 1000).toFixed(2)}</td>
                  <td className="px-3 py-2 border-b border-[#1a2030]">{r.mean.toFixed(3)}</td>
                  <td className="px-3 py-2 border-b border-[#1a2030]">{r.p50.toFixed(3)}</td>
                  <td className="px-3 py-2 border-b border-[#1a2030]">{r.p95.toFixed(3)}</td>
                  <td
                    className="px-3 py-2 border-b border-[#1a2030] font-bold"
                    style={{
                      color: r.sp >= 2 ? "#4caf7d" : r.sp >= 1 ? "#f5a623" : "#e05252",
                    }}
                  >
                    {r.sp.toFixed(2)}×
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  Load CSV files to populate table
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
