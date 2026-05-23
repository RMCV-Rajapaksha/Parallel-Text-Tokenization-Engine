import { useMemo, useState } from "react";
import { bpeEncode, encodeTrace, learnBPE, type Merge } from "@/lib/bpe";

const DEFAULT_CORPUS =
  "low low low low low lower lower newest newest newest newest newest newest widest widest widest";

const TOK_BG = ["#4c8ef530", "#f5a62330", "#4caf7d30", "#e0525230", "#8172b230", "#b06ef530"];
const TOK_FG = ["#4c8ef5", "#f5a623", "#4caf7d", "#e05252", "#8172b2", "#b06ef5"];

function Token({ t, i }: { t: string; i: number }) {
  if (t === "</w>")
    return (
      <span className="text-[10px] text-muted-foreground opacity-60 ml-0.5">⟨/w⟩</span>
    );
  const c = i % TOK_BG.length;
  return (
    <span
      className="inline-block px-2 py-0.5 mr-1 mb-1 rounded text-xs font-mono"
      style={{ background: TOK_BG[c], color: TOK_FG[c], border: `1px solid ${TOK_FG[c]}60` }}
    >
      {t}
    </span>
  );
}

export function BPEDemo() {
  const [corpus, setCorpus] = useState(DEFAULT_CORPUS);
  const [numMerges, setNumMerges] = useState(10);
  const [testWord, setTestWord] = useState("lowest");

  const words = useMemo(() => corpus.split(/\s+/).filter(Boolean), [corpus]);
  const merges: Merge[] = useMemo(() => learnBPE(words, numMerges), [words, numMerges]);
  const trace = useMemo(() => encodeTrace(testWord, merges), [testWord, merges]);
  const finalTokens = useMemo(() => bpeEncode(testWord, merges), [testWord, merges]);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">
            Training corpus
          </label>
          <textarea
            value={corpus}
            onChange={(e) => setCorpus(e.target.value)}
            rows={4}
            className="mt-2 w-full bg-[var(--surface-2)] border border-border rounded p-3 text-sm font-mono text-foreground resize-none focus:outline-none focus:border-[var(--seq)]"
          />
          <div className="mt-4">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">
              Number of merges: <span className="text-[var(--seq)]">{numMerges}</span>
            </label>
            <input
              type="range"
              min={0}
              max={30}
              value={numMerges}
              onChange={(e) => setNumMerges(parseInt(e.target.value))}
              className="w-full mt-2 accent-[var(--seq)]"
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">
            Encode word
          </label>
          <input
            value={testWord}
            onChange={(e) => setTestWord(e.target.value.trim())}
            className="mt-2 w-full bg-[var(--surface-2)] border border-border rounded p-3 text-sm font-mono text-foreground focus:outline-none focus:border-[var(--seq)]"
          />
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-display mb-2">
              Final tokens · {finalTokens.filter((t) => t !== "</w>").length}
            </div>
            <div className="bg-[var(--surface-2)] border border-border rounded p-3 min-h-[60px]">
              {finalTokens.map((t, i) => (
                <Token key={i} t={t} i={i} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-display mb-3">
          Learned merge rules (in order)
        </div>
        {merges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No merges yet — raise the slider.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {merges.map(([a, b], i) => (
              <div
                key={i}
                className="text-xs font-mono bg-[var(--surface-2)] border border-border rounded px-2 py-1"
              >
                <span className="text-muted-foreground mr-2">#{i + 1}</span>
                <span className="text-[var(--seq)]">{a}</span>
                <span className="text-muted-foreground"> + </span>
                <span className="text-[var(--omp)]">{b}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="text-foreground">{a + b}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-display mb-3">
          Step-by-step encoding of "{testWord}"
        </div>
        <div className="space-y-2">
          {trace.map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground w-12 shrink-0">
                {i === 0 ? "init" : `step ${i}`}
              </span>
              <div className="flex flex-wrap items-center">
                {row.map((t, j) => (
                  <Token key={j} t={t} i={j} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
