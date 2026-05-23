import { useCallback, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell,
} from "recharts";
import { useVisualizer, getSummaryStats } from "./VisualizerContext";
import { varColor, varClass } from "@/lib/csv";

export function OverviewPanel() {
  const { variants, isDemo, loadCSVFiles } = useVisualizer();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loadedLabels, setLoadedLabels] = useState<string[]>([]);

  const keys = Object.keys(variants);
  const stats = useMemo(() => getSummaryStats(variants), [variants]);

  // ── CSV Upload handlers ──
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const labels = await loadCSVFiles(files);
      setLoadedLabels((prev) => [...prev, ...labels]);
    },
    [loadCSVFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.endsWith(".csv"),
      );
      if (files.length) handleFiles(files);
    },
    [handleFiles],
  );

  // ── Cumulative time data ──
  const cumData = useMemo(() => {
    if (!keys.length) return [];
    const maxLen = Math.max(...keys.map((k) => variants[k].length));
    const rows: Record<string, number | string>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, number | string> = { step: i + 1 };
      keys.forEach((k) => {
        const d = variants[k];
        if (i < d.length) {
          let cum = 0;
          for (let j = 0; j <= i; j++) cum += d[j].wall_ms || 0;
          row[k] = +(cum / 1000).toFixed(4);
        }
      });
      rows.push(row);
    }
    return rows;
  }, [variants, keys]);

  // ── Speedup bars ──
  const speedupData = useMemo(() => {
    const seqData = variants["Sequential"];
    if (!seqData) return [];
    const seqTotal = seqData.reduce((s, r) => s + (r.wall_ms || 0), 0);
    return [...keys]
      .map((k) => {
        const total = variants[k].reduce((s, r) => s + (r.wall_ms || 0), 0);
        return { label: k, speedup: +(seqTotal / total).toFixed(2) };
      })
      .sort((a, b) => a.speedup - b.speedup);
  }, [variants, keys]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Demo banner */}
      {isDemo && (
        <div className="bg-card border border-border rounded-md px-4 py-2.5 text-xs text-muted-foreground">
          ⚡ <strong className="text-[var(--seq)]">Demo mode</strong> — showing
          synthetic BPE data. Drop your own CSV files from Colab to see real
          results.
        </div>
      )}

      {/* ── CSV Upload Zone ── */}
      <section>
        <SectionTitle>Load CSV Results</SectionTitle>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-3">
            Upload Exported CSV Files from Colab
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg py-10 text-center cursor-pointer transition-colors bg-[var(--surface-2)] ${
              dragging
                ? "border-[var(--seq)] bg-[var(--seq)]/5"
                : "border-border hover:border-[var(--seq)]/60"
            }`}
          >
            <div className="text-4xl mb-3">📂</div>
            <div className="font-display font-bold text-foreground text-sm">
              Drop CSV files here or click to browse
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">
              seq_results.csv · omp_*.csv · mpi_*.csv · cuda_results.csv ·
              hybrid_*.csv
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {loadedLabels.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {loadedLabels.map((l) => (
                <VariantBadge key={l} label={l} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Summary Stats ── */}
      <section>
        <SectionTitle>Summary Stats</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            cls="seq"
            label="Total Merges"
            value={stats.totalMerges > 0 ? stats.totalMerges.toLocaleString() : "—"}
            sub="across all variants"
          />
          <StatTile
            cls="omp"
            label="Variants Loaded"
            value={String(stats.variantCount)}
            sub="CSV files"
          />
          <StatTile
            cls="mpi"
            label="Max Speedup"
            value={stats.maxSpeedup > 1 ? stats.maxSpeedup.toFixed(2) + "×" : "—"}
            sub="vs sequential"
          />
          <StatTile
            cls="cuda"
            label="Fastest Variant"
            value={stats.fastest}
            sub="by total time"
            smallValue
          />
        </div>
      </section>

      {/* ── Charts ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Cumulative time */}
        <div>
          <SectionTitle>Cumulative Time Comparison</SectionTitle>
          <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cumData} margin={{ top: 10, right: 16, bottom: 20, left: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis
                  dataKey="step"
                  tick={{ fill: "#5a6585", fontSize: 10 }}
                  label={{ value: "step", position: "insideBottom", offset: -10, fill: "#3a445a", fontSize: 10 }}
                />
                <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: "#5a6585" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                  iconType="plainline"
                />
                {keys.map((k) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={varColor(k)}
                    strokeWidth={2}
                    dot={false}
                    name={k}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Speedup bars */}
        <div>
          <SectionTitle>Speedup vs Sequential</SectionTitle>
          {speedupData.length > 0 ? (
            <div className="bg-card border border-border rounded-lg p-4 space-y-2.5">
              {speedupData.map((d) => {
                const maxSp = Math.max(...speedupData.map((s) => s.speedup));
                const pct = (d.speedup / (maxSp * 1.1)) * 100;
                return (
                  <div key={d.label} className="flex items-center gap-3">
                    <span className="w-[100px] text-right text-[11px] text-foreground shrink-0 truncate">
                      {d.label}
                    </span>
                    <div className="flex-1 bg-[var(--surface-2)] rounded h-[18px] relative overflow-hidden">
                      <div
                        className="h-full rounded flex items-center pl-2 transition-all duration-700 ease-out"
                        style={{
                          width: `${pct}%`,
                          background: varColor(d.label),
                        }}
                      >
                        <span className="text-[10px] font-bold text-white whitespace-nowrap">
                          {d.speedup.toFixed(2)}×
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <NoData icon="⏳" text="Load CSV files to see speedup comparison" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Small sub-components ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-xs font-bold uppercase tracking-[1.5px] text-muted-foreground mb-4 flex items-center gap-3">
      {children}
      <span className="flex-1 h-px bg-border" />
    </h3>
  );
}

function StatTile({
  cls,
  label,
  value,
  sub,
  smallValue,
}: {
  cls: string;
  label: string;
  value: string;
  sub: string;
  smallValue?: boolean;
}) {
  const colors: Record<string, string> = {
    seq: "var(--seq)",
    omp: "var(--omp)",
    mpi: "var(--mpi)",
    cuda: "var(--cuda)",
    hybrid: "var(--hybrid)",
  };
  return (
    <div className="bg-[var(--surface-2)] border border-border rounded-md px-4 py-3.5 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: colors[cls] || "var(--seq)" }}
      />
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`font-display font-extrabold text-white leading-none mt-1 ${
          smallValue ? "text-sm mt-2" : "text-2xl"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function VariantBadge({ label }: { label: string }) {
  const cls = varClass(label);
  const colorMap: Record<string, { bg: string; fg: string; border: string }> = {
    seq:    { bg: "#4c8ef520", fg: "var(--seq)",    border: "#4c8ef540" },
    omp:    { bg: "#f5a62320", fg: "var(--omp)",    border: "#f5a62340" },
    mpi:    { bg: "#4caf7d20", fg: "var(--mpi)",    border: "#4caf7d40" },
    cuda:   { bg: "#e0525220", fg: "var(--cuda)",   border: "#e0525240" },
    hybrid: { bg: "#b06ef520", fg: "var(--hybrid)", border: "#b06ef540" },
  };
  const c = colorMap[cls] || colorMap.seq;
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {label}
    </span>
  );
}

export function NoData({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
      <div className="text-5xl opacity-40">{icon}</div>
      <p className="text-xs leading-relaxed max-w-xs">{text}</p>
    </div>
  );
}

export { SectionTitle, VariantBadge };
