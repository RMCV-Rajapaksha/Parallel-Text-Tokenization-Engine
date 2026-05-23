import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { useVisualizer } from "./VisualizerContext";
import { SectionTitle, NoData } from "./OverviewPanel";

export function AnalysisPanel() {
  const { variants } = useVisualizer();
  const seqData = variants["Sequential"];

  // ── Vocab Size Growth ──
  const vocabData = useMemo(() => {
    if (!seqData || seqData[0]?.vocab_size === undefined) return null;
    return seqData.map((r) => ({ step: r.step, vocab_size: r.vocab_size || 0 }));
  }, [seqData]);

  // ── Avg Token Length ──
  const tokLenData = useMemo(() => {
    if (!seqData || seqData[0]?.avg_tok_len === undefined) return null;
    return seqData.map((r) => ({ step: r.step, avg_tok_len: r.avg_tok_len || 0 }));
  }, [seqData]);

  // ── Top 30 Merges ──
  const top30 = useMemo(() => {
    if (!seqData) return [];
    return [...seqData].sort((a, b) => (b.freq || 0) - (a.freq || 0)).slice(0, 30);
  }, [seqData]);

  const maxFreq = top30[0]?.freq || 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SectionTitle>Vocabulary & Token Length</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        {/* Vocab size */}
        <div>
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-2">
            Vocabulary Size Growth
          </div>
          <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
            {vocabData ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={vocabData} margin={{ top: 10, right: 16, bottom: 20, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                  <XAxis
                    dataKey="step"
                    tick={{ fill: "#5a6585", fontSize: 10 }}
                    label={{ value: "step", position: "insideBottom", offset: -10, fill: "#3a445a", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }} />
                  <Area type="monotone" dataKey="vocab_size" stroke="#4c8ef5" fill="#4c8ef5" fillOpacity={0.1} strokeWidth={1.8} name="Vocabulary size" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoData icon="📊" text="Requires vocab_size column (Sequential)" />
            )}
          </div>
        </div>

        {/* Token length */}
        <div>
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-2">
            Average Token Length
          </div>
          <div className="bg-[var(--surface-2)] border border-border rounded-md p-2">
            {tokLenData ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={tokLenData} margin={{ top: 10, right: 16, bottom: 20, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                  <XAxis
                    dataKey="step"
                    tick={{ fill: "#5a6585", fontSize: 10 }}
                    label={{ value: "step", position: "insideBottom", offset: -10, fill: "#3a445a", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#5a6585", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#111520", border: "1px solid #1e2535", borderRadius: 6, fontSize: 11 }} />
                  <Area type="monotone" dataKey="avg_tok_len" stroke="#f5a623" fill="#f5a623" fillOpacity={0.1} strokeWidth={1.8} name="Avg token length" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoData icon="📊" text="Requires avg_tok_len column (Sequential)" />
            )}
          </div>
        </div>
      </div>

      {/* ── Heatmap ── */}
      <SectionTitle>Merge Length Heatmap</SectionTitle>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-3">
          Mean pair frequency by (step bin × merged token length)
        </div>
        {seqData ? (
          <HeatmapCanvas data={seqData} />
        ) : (
          <NoData icon="🗺️" text="Requires Sequential data" />
        )}
      </div>

      {/* ── Top 30 Merges ── */}
      <SectionTitle>Top 30 Merges by Frequency</SectionTitle>
      <div className="bg-card border border-border rounded-lg overflow-hidden max-h-[340px] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 border-b border-border">#</th>
              <th className="px-3 py-2.5 border-b border-border">Step</th>
              <th className="px-3 py-2.5 border-b border-border">Pair A</th>
              <th className="px-3 py-2.5 border-b border-border">Pair B</th>
              <th className="px-3 py-2.5 border-b border-border">Merged</th>
              <th className="px-3 py-2.5 border-b border-border">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {top30.length > 0 ? (
              top30.map((r, i) => {
                const pct = ((r.freq || 0) / maxFreq) * 100;
                return (
                  <tr key={i} className="hover:bg-[#151c2a] transition-colors">
                    <td className="px-3 py-2 border-b border-[#1a2030]">{i + 1}</td>
                    <td className="px-3 py-2 border-b border-[#1a2030]">{r.step}</td>
                    <td className="px-3 py-2 border-b border-[#1a2030]">
                      <span className="font-mono text-[11px] bg-[#1e2535] px-1.5 py-0.5 rounded">{r.pair_a}</span>
                    </td>
                    <td className="px-3 py-2 border-b border-[#1a2030]">
                      <span className="font-mono text-[11px] bg-[#1e2535] px-1.5 py-0.5 rounded">{r.pair_b}</span>
                    </td>
                    <td className="px-3 py-2 border-b border-[#1a2030]">
                      <span className="font-mono text-[11px] bg-[#1e2535] px-1.5 py-0.5 rounded text-[#4c8ef5]">
                        {r.pair_a}{r.pair_b}
                      </span>
                    </td>
                    <td className="px-3 py-2 border-b border-[#1a2030]">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded bg-[var(--seq)] opacity-70"
                          style={{ width: `${pct}px` }}
                        />
                        {(r.freq || 0).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  Load sequential CSV to view top merges
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Canvas Heatmap Component ── */
function HeatmapCanvas({ data }: { data: { step: number; pair_a: string; pair_b: string; freq: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const N_BINS = 10;
    const maxLen = 12;
    const bins: { sum: number; cnt: number }[][] = Array.from({ length: N_BINS }, () =>
      Array.from({ length: maxLen + 1 }, () => ({ sum: 0, cnt: 0 })),
    );

    const maxStep = Math.max(...data.map((r) => r.step));
    data.forEach((r) => {
      const bin = Math.min(Math.floor(((r.step - 1) / maxStep) * N_BINS), N_BINS - 1);
      const len = String(r.pair_a).length + String(r.pair_b).length;
      if (len <= maxLen) {
        bins[bin][len].sum += r.freq || 0;
        bins[bin][len].cnt += 1;
      }
    });

    const vals = bins.flatMap((b) => b.map((c) => (c.cnt ? c.sum / c.cnt : 0)));
    const maxV = Math.max(...vals) || 1;

    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    const cw = (parent?.clientWidth || 500) - 32;
    const ch = 180;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cellW = (cw - 40) / N_BINS;
    const cellH = (ch - 30) / (maxLen + 1);

    for (let b = 0; b < N_BINS; b++) {
      for (let l = 0; l <= maxLen; l++) {
        const cell = bins[b][l];
        const v = cell.cnt ? cell.sum / cell.cnt : 0;
        const t = v / maxV;
        const r2 = Math.round(20 + t * 200);
        const g2 = Math.round(40 + t * 60);
        ctx.fillStyle = `rgba(${r2},${g2},20,${0.2 + t * 0.8})`;
        ctx.fillRect(40 + b * cellW, ch - 30 - (l + 1) * cellH, cellW - 1, cellH - 1);
      }
    }

    ctx.fillStyle = "#5a6585";
    ctx.font = "10px Space Mono, monospace";
    for (let b = 0; b < N_BINS; b++) {
      ctx.textAlign = "center";
      ctx.fillText(String(b), 40 + b * cellW + cellW / 2, ch - 15);
    }
    for (let l = 1; l <= maxLen; l += 2) {
      ctx.textAlign = "right";
      ctx.fillText(String(l), 36, ch - 30 - l * cellH + cellH / 2 + 3);
    }
    ctx.fillStyle = "#3a445a";
    ctx.textAlign = "center";
    ctx.fillText("Step bin →", 40 + (N_BINS * cellW) / 2, ch - 2);

    // Legend
    const gc = legendRef.current;
    if (gc) {
      const gctx = gc.getContext("2d");
      if (gctx) {
        const grad = gctx.createLinearGradient(0, 0, 140, 0);
        grad.addColorStop(0, "rgba(20,40,20,.3)");
        grad.addColorStop(1, "rgba(220,100,20,1)");
        gctx.fillStyle = grad;
        gctx.fillRect(0, 0, 140, 12);
      }
    }
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  return (
    <>
      <canvas ref={canvasRef} className="rounded block" />
      <div className="flex items-center gap-3 mt-2.5 text-[11px] text-muted-foreground">
        <span>Low freq</span>
        <canvas ref={legendRef} width={140} height={12} className="rounded" />
        <span>High freq</span>
      </div>
    </>
  );
}
