import { createFileRoute, Link } from "@tanstack/react-router";
import { BPEDemo } from "@/components/BPEDemo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "How BPE Works — Byte Pair Encoding, Step by Step" },
      {
        name: "description",
        content:
          "An interactive, step-by-step explainer of Byte Pair Encoding (BPE) — the tokenization algorithm behind GPT, LLaMA, and most modern LLMs.",
      },
    ],
  }),
  component: Index,
});

const STEPS = [
  {
    n: "01",
    title: "Start with characters",
    body:
      "Split every word in the training corpus into individual characters and append a special end-of-word marker ⟨/w⟩. The initial vocabulary is just the set of characters that appear.",
    code: `"low" → [l, o, w, </w>]
"lowest" → [l, o, w, e, s, t, </w>]`,
  },
  {
    n: "02",
    title: "Count adjacent pairs",
    body:
      "Scan every word and count how often each adjacent symbol pair occurs, weighted by the word's frequency in the corpus.",
    code: `pairs("low" ×5) → (l,o):5, (o,w):5, (w,</w>):5
pairs("lower" ×2) → (l,o):2, (o,w):2, (w,e):2, (e,r):2, (r,</w>):2`,
  },
  {
    n: "03",
    title: "Merge the most frequent pair",
    body:
      "Pick the pair with the highest count, record it as a merge rule, and rewrite every occurrence in every word as a single new symbol.",
    code: `best pair: (l, o) → new symbol "lo"
[l, o, w, </w>]  →  [lo, w, </w>]
[l, o, w, e, r, </w>]  →  [lo, w, e, r, </w>]`,
  },
  {
    n: "04",
    title: "Repeat until vocabulary is full",
    body:
      "Recount pairs on the updated sequences and merge again. Keep going for N steps (e.g. 10k–50k). The output is an ordered list of merge rules — that's the trained BPE model.",
    code: `step 1: (l, o)  → lo
step 2: (lo, w) → low
step 3: (e, s)  → es
step 4: (es, t) → est
…`,
  },
  {
    n: "05",
    title: "Encode new words",
    body:
      "To tokenize a new word, split it into characters + ⟨/w⟩, then apply every learned merge rule in order. What remains are the BPE tokens fed to the model.",
    code: `encode("lowest"):
[l, o, w, e, s, t, </w>]
→ apply (l,o):    [lo, w, e, s, t, </w>]
→ apply (lo,w):   [low, e, s, t, </w>]
→ apply (e,s):    [low, es, t, </w>]
→ apply (es,t):   [low, est, </w>]`,
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 md:px-12 py-8 bg-gradient-to-b from-[oklch(0.20_0.025_260)] to-background">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">
          How <span className="text-[var(--seq)]">BPE</span> Works
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Byte Pair Encoding — the tokenization algorithm behind GPT, LLaMA, and most modern LLMs.
          Originally a compression trick (Gage, 1994), adapted to NLP by Sennrich et al. (2016).
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          {["Compression", "Subword", "Reversible", "Language-agnostic"].map((t) => (
            <span
              key={t}
              className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--seq)]/40 bg-[var(--seq)]/10 text-[var(--seq)] font-bold"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-4">
          <Link
            to="/visualizer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--seq)]/15 border border-[var(--seq)]/40 text-[var(--seq)] text-xs font-display font-bold uppercase tracking-wider hover:bg-[var(--seq)]/25 transition-colors"
          >
            Parallel Engine Visualizer →
          </Link>
        </div>
      </header>

      <main className="px-6 md:px-12 py-10 max-w-6xl mx-auto space-y-12">
        <section>
          <h2 className="font-display text-xs uppercase tracking-[1.5px] text-muted-foreground mb-6 flex items-center gap-3">
            The Algorithm
            <span className="flex-1 h-px bg-border" />
          </h2>
          <div className="grid gap-4">
            {STEPS.map((s) => (
              <article
                key={s.n}
                className="bg-card border border-border rounded-lg p-6 grid md:grid-cols-[80px_1fr] gap-4 md:gap-6"
              >
                <div className="font-display text-4xl font-extrabold text-[var(--seq)] leading-none">
                  {s.n}
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground mb-2">
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{s.body}</p>
                  <pre className="bg-[var(--surface-2)] border border-border rounded p-3 text-xs font-mono text-[#82c89a] overflow-x-auto whitespace-pre">
{s.code}
                  </pre>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xs uppercase tracking-[1.5px] text-muted-foreground mb-6 flex items-center gap-3">
            Try It Live
            <span className="flex-1 h-px bg-border" />
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
            Edit the corpus, change the number of merges, and encode any word. The encoder uses the
            exact <code className="text-[var(--seq)]">bpeEncode</code> function from the parallel
            engine visualizer.
          </p>
          <BPEDemo />
        </section>

        <section>
          <h2 className="font-display text-xs uppercase tracking-[1.5px] text-muted-foreground mb-6 flex items-center gap-3">
            The Function
            <span className="flex-1 h-px bg-border" />
          </h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <pre className="text-xs font-mono text-[#82c89a] overflow-x-auto leading-relaxed">
{`function bpeEncode(word, merges) {
  let tokens = [...word, '</w>'];
  for (const [a, b] of merges) {
    const nt = [];
    let i = 0;
    while (i < tokens.length) {
      if (i < tokens.length - 1 && tokens[i] === a && tokens[i+1] === b) {
        nt.push(a + b); i += 2;
      } else {
        nt.push(tokens[i++]);
      }
    }
    tokens = nt;
  }
  return tokens;
}`}
            </pre>
            <p className="text-xs text-muted-foreground mt-4">
              Greedy left-to-right scan, applying each learned merge in the order it was learned.
              O(N·M) per word, where N = symbols and M = merges.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 md:px-12 py-6 text-[11px] text-muted-foreground">
        Based on Sennrich, Haddow & Birch (2016) — <em>Neural Machine Translation of Rare Words with Subword Units</em>.
      </footer>
    </div>
  );
}
