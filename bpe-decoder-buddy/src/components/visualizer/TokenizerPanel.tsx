import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisualizer } from "./VisualizerContext";
import { bpeEncode } from "@/lib/bpe";
import { SectionTitle, NoData } from "./OverviewPanel";

const TOK_BG = ["#4c8ef530", "#f5a62330", "#4caf7d30", "#e0525230", "#8172b230", "#b06ef530"];
const TOK_FG = ["#4c8ef5", "#f5a623", "#4caf7d", "#e05252", "#8172b2", "#b06ef5"];

function TokenPill({ token, index }: { token: string; index: number }) {
  if (token === "</w>") {
    return (
      <span className="text-[9px] text-muted-foreground px-1.5 py-0.5 border border-border rounded bg-[#0d1220]">
        ⟨/w⟩
      </span>
    );
  }
  const ci = index % TOK_BG.length;
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded text-xs font-bold font-mono"
      style={{
        background: TOK_BG[ci],
        color: TOK_FG[ci],
        border: `1px solid ${TOK_FG[ci]}40`,
      }}
    >
      {token}
    </span>
  );
}

function buildMerges(data: { pair_a: string; pair_b: string }[], n: number): [string, string][] {
  return data.slice(0, n).map((r) => [String(r.pair_a), String(r.pair_b)]);
}

export function TokenizerPanel() {
  const { variants } = useVisualizer();
  const keys = Object.keys(variants);

  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [nMerges, setNMerges] = useState(200);
  const [inputText, setInputText] = useState("playing tokenization unconstitutional corporation");
  const [tokenized, setTokenized] = useState<{ word: string; tokens: string[] }[] | null>(null);

  // Animation state
  const [animStep, setAnimStep] = useState(0);
  const [animPlaying, setAnimPlaying] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeVariant = selectedVariant && variants[selectedVariant]
    ? selectedVariant
    : keys.includes("Sequential") ? "Sequential" : keys[0] || "";

  const maxMerges = variants[activeVariant]?.length || 200;

  // ── Run Tokenizer ──
  const runTokenizer = useCallback(() => {
    if (!activeVariant || !variants[activeVariant]) return;
    const merges = buildMerges(variants[activeVariant], nMerges);
    const words = inputText.split(/\s+/).filter(Boolean);
    const results = words.map((w) => ({
      word: w,
      tokens: bpeEncode(w, merges),
    }));
    setTokenized(results);
    setAnimStep(0);
  }, [activeVariant, variants, nMerges, inputText]);

  // ── Animation ──
  const animOutput = useMemo(() => {
    if (!activeVariant || !variants[activeVariant]) return null;
    const merges = buildMerges(variants[activeVariant], animStep);
    const words = inputText.split(/\s+/).filter(Boolean).slice(0, 3);
    return words.map((w) => ({
      word: w,
      tokens: bpeEncode(w, merges),
    }));
  }, [activeVariant, variants, animStep, inputText]);

  const togglePlay = useCallback(() => {
    if (animPlaying) {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
      setAnimPlaying(false);
      return;
    }
    setAnimPlaying(true);
    let cur = 0;
    const max = Math.min(nMerges, maxMerges);
    animTimerRef.current = setInterval(() => {
      setAnimStep(cur);
      cur++;
      if (cur > max) {
        if (animTimerRef.current) clearInterval(animTimerRef.current);
        setAnimPlaying(false);
      }
    }, 80);
  }, [animPlaying, nMerges, maxMerges]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, []);

  let colorIdx = 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SectionTitle>Live BPE Tokenizer</SectionTitle>

      {/* Config */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-3">
          Configuration
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={activeVariant}
            onChange={(e) => setSelectedVariant(e.target.value)}
            className="bg-[var(--surface-2)] border border-border text-foreground rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--seq)] flex-1 min-w-[160px]"
          >
            <option value="">— Select variant for merge rules —</option>
            {keys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <label className="text-[11px] text-muted-foreground whitespace-nowrap">Merges to apply:</label>
          <input
            type="number"
            value={nMerges}
            min={1}
            max={2000}
            onChange={(e) => setNMerges(parseInt(e.target.value) || 200)}
            className="bg-[var(--surface-2)] border border-border text-foreground rounded px-3 py-2 text-sm font-mono w-[90px] focus:outline-none focus:border-[var(--seq)]"
          />
        </div>
      </div>

      {/* Input + Tokenize button */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a word or sentence…"
          className="bg-[var(--surface-2)] border border-border text-foreground rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--seq)] flex-1"
        />
        <button
          onClick={runTokenizer}
          className="bg-[var(--seq)] text-white border-none px-5 py-2 rounded font-display text-xs font-bold uppercase tracking-wider hover:opacity-85 transition-opacity whitespace-nowrap"
        >
          Tokenize ▶
        </button>
      </div>

      {/* Tokenizer output */}
      <div className="bg-card border border-border rounded-lg p-5">
        {tokenized ? (
          <div className="space-y-4">
            {tokenized.map((w, wi) => {
              const localStart = colorIdx;
              return (
                <div key={wi}>
                  <div className="text-[11px] text-muted-foreground mb-1.5">{w.word}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {w.tokens.map((tok, ti) => {
                      const pill = <TokenPill key={ti} token={tok} index={colorIdx} />;
                      if (tok !== "</w>") colorIdx++;
                      return pill;
                    })}
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {w.tokens.filter((t) => t !== "</w>").length} tokens
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <NoData icon="🔤" text="Enter text and click Tokenize" />
        )}
      </div>

      {/* Step-by-step animation */}
      <SectionTitle>Step-by-Step Animation</SectionTitle>
      <div className="flex items-center gap-4 bg-[var(--surface-2)] border border-border rounded-md px-4 py-3">
        <label className="text-[11px] text-muted-foreground whitespace-nowrap">Merge step:</label>
        <input
          type="range"
          min={0}
          max={Math.min(nMerges, maxMerges)}
          value={animStep}
          onChange={(e) => setAnimStep(parseInt(e.target.value))}
          className="flex-1 accent-[var(--seq)]"
        />
        <span className="font-display text-base font-extrabold text-[var(--seq)] min-w-[40px] text-right">
          {animStep}
        </span>
        <button
          onClick={togglePlay}
          className="bg-[var(--seq)] text-white border-none px-4 py-1.5 rounded font-display text-[10px] font-bold uppercase tracking-wider hover:opacity-85 transition-opacity whitespace-nowrap"
        >
          {animPlaying ? "⏹ Stop" : "▶ Play"}
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 min-h-[80px]">
        {animOutput ? (
          <div className="space-y-4">
            {(() => { colorIdx = 0; return null; })()}
            {animOutput.map((w, wi) => (
              <div key={wi}>
                <div className="text-[11px] text-muted-foreground mb-1.5">{w.word}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {w.tokens.map((tok, ti) => {
                    const pill = <TokenPill key={ti} token={tok} index={colorIdx} />;
                    if (tok !== "</w>") colorIdx++;
                    return pill;
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <NoData icon="" text="Adjust slider to see step-by-step tokenization" />
        )}
      </div>
    </div>
  );
}
