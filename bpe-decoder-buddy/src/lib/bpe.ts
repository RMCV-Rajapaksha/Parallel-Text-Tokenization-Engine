// BPE encoder ported from main.html (visualizer)
export type Merge = [string, string];

export function bpeEncode(word: string, merges: Merge[]): string[] {
  let tokens: string[] = [...word, "</w>"];
  for (const [a, b] of merges) {
    const nt: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (i < tokens.length - 1 && tokens[i] === a && tokens[i + 1] === b) {
        nt.push(a + b);
        i += 2;
      } else {
        nt.push(tokens[i++]);
      }
    }
    tokens = nt;
  }
  return tokens;
}

// Learn merges from a small training corpus (standard BPE training loop)
export function learnBPE(corpus: string[], numMerges: number): Merge[] {
  // Initial vocab: each word -> list of chars + </w>, with frequency
  const wordFreq = new Map<string, number>();
  for (const w of corpus) {
    if (!w) continue;
    wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }
  let splits = new Map<string, string[]>();
  for (const w of wordFreq.keys()) splits.set(w, [...w, "</w>"]);

  const merges: Merge[] = [];
  for (let step = 0; step < numMerges; step++) {
    const pairs = new Map<string, number>();
    for (const [w, freq] of wordFreq) {
      const sym = splits.get(w)!;
      for (let i = 0; i < sym.length - 1; i++) {
        const k = sym[i] + "\u0001" + sym[i + 1];
        pairs.set(k, (pairs.get(k) ?? 0) + freq);
      }
    }
    if (pairs.size === 0) break;
    let bestKey = "";
    let bestCount = -1;
    for (const [k, c] of pairs) {
      if (c > bestCount) { bestCount = c; bestKey = k; }
    }
    const [a, b] = bestKey.split("\u0001") as [string, string];
    merges.push([a, b]);
    const next = new Map<string, string[]>();
    for (const [w, sym] of splits) {
      const nt: string[] = [];
      let i = 0;
      while (i < sym.length) {
        if (i < sym.length - 1 && sym[i] === a && sym[i + 1] === b) {
          nt.push(a + b); i += 2;
        } else nt.push(sym[i++]);
      }
      next.set(w, nt);
    }
    splits = next;
  }
  return merges;
}

// Snapshot encoding at each merge step (for step-by-step visualization)
export function encodeTrace(word: string, merges: Merge[]): string[][] {
  const trace: string[][] = [];
  let tokens: string[] = [...word, "</w>"];
  trace.push([...tokens]);
  for (const [a, b] of merges) {
    const nt: string[] = [];
    let i = 0;
    let changed = false;
    while (i < tokens.length) {
      if (i < tokens.length - 1 && tokens[i] === a && tokens[i + 1] === b) {
        nt.push(a + b); i += 2; changed = true;
      } else nt.push(tokens[i++]);
    }
    tokens = nt;
    if (changed) trace.push([...tokens]);
  }
  return trace;
}
