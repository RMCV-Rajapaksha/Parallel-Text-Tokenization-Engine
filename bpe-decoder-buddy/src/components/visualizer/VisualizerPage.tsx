import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { VisualizerProvider } from "./VisualizerContext";
import { OverviewPanel } from "./OverviewPanel";
import { MergeStepsPanel } from "./MergeStepsPanel";
import { TokenizerPanel } from "./TokenizerPanel";
import { PerformancePanel } from "./PerformancePanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { DesignNotesPanel } from "./DesignNotesPanel";

const TABS = [
  { id: "overview",    label: "Overview" },
  { id: "merges",      label: "Merge Steps" },
  { id: "tokenizer",   label: "Tokenizer" },
  { id: "performance", label: "Performance" },
  { id: "analysis",    label: "Analysis" },
  { id: "notes",       label: "Design Notes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function VisualizerPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <VisualizerProvider>
      <div className="min-h-screen bg-background text-foreground">
        {/* ── HEADER ── */}
        <header className="px-6 md:px-9 py-6 border-b border-border bg-gradient-to-b from-[oklch(0.20_0.025_260)] to-background flex items-end gap-6 flex-wrap">
          <div>
            <Link to="/" className="text-muted-foreground hover:text-foreground text-[10px] uppercase tracking-widest font-display mb-1 block transition-colors">
              ← BPE Decoder Buddy
            </Link>
            <h1 className="font-display text-xl md:text-2xl font-extrabold tracking-tight">
              BPE <span className="text-[var(--seq)]">Parallel</span> Engine
            </h1>
            <div className="text-[11px] text-muted-foreground mt-1">
              Penn Treebank · From-scratch C/C++ Tokenizer
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[
                { label: "Sequential", cls: "seq" },
                { label: "OpenMP", cls: "omp" },
                { label: "MPI", cls: "mpi" },
                { label: "CUDA", cls: "cuda" },
                { label: "MPI+CUDA", cls: "hybrid" },
              ].map((b) => (
                <BadgePill key={b.label} label={b.label} cls={b.cls} />
              ))}
            </div>
          </div>
        </header>

        {/* ── TABS ── */}
        <nav className="flex gap-0 border-b border-border px-6 md:px-9 bg-card sticky top-0 z-50 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                activeTab === t.id
                  ? "text-white border-[var(--seq)]"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── CONTENT ── */}
        <main className="px-6 md:px-9 py-7">
          {activeTab === "overview" && <OverviewPanel />}
          {activeTab === "merges" && <MergeStepsPanel />}
          {activeTab === "tokenizer" && <TokenizerPanel />}
          {activeTab === "performance" && <PerformancePanel />}
          {activeTab === "analysis" && <AnalysisPanel />}
          {activeTab === "notes" && <DesignNotesPanel />}
        </main>
      </div>
    </VisualizerProvider>
  );
}

function BadgePill({ label, cls }: { label: string; cls: string }) {
  const colors: Record<string, { bg: string; fg: string; border: string }> = {
    seq:    { bg: "#4c8ef520", fg: "var(--seq)",    border: "#4c8ef540" },
    omp:    { bg: "#f5a62320", fg: "var(--omp)",    border: "#f5a62340" },
    mpi:    { bg: "#4caf7d20", fg: "var(--mpi)",    border: "#4caf7d40" },
    cuda:   { bg: "#e0525220", fg: "var(--cuda)",   border: "#e0525240" },
    hybrid: { bg: "#b06ef520", fg: "var(--hybrid)", border: "#b06ef540" },
  };
  const c = colors[cls] || colors.seq;
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {label}
    </span>
  );
}
