// Synthetic BPE demo data generator — mirrors loadDemoData() from main.html
import type { BPERow, VariantsMap } from "./csv";

const PAIRS: [string, string][] = [
  ["t", "h"], ["h", "e"], ["in", "g"], ["e", "r"], ["a", "n"],
  ["o", "n"], ["e", "d"], ["th", "e"], ["i", "n"], ["re", "s"],
  ["s", "t"], ["a", "t"], ["l", "e"], ["i", "t"], ["o", "f"],
  ["e", "n"], ["a", "r"], ["o", "r"], ["n", "d"], ["c", "e"],
  ["i", "s"], ["t", "er"], ["a", "l"], ["i", "c"], ["r", "e"],
  ["d", "e"], ["s", "e"], ["he", "r"], ["c", "o"], ["m", "e"],
];

const VARIANT_CONFIGS: Record<string, { base: number; scale: number }> = {
  Sequential: { base: 45, scale: 1.0 },
  "OMP-2t":   { base: 25, scale: 0.95 },
  "OMP-4t":   { base: 14, scale: 0.9 },
  "MPI-2p":   { base: 22, scale: 0.92 },
  "MPI-4p":   { base: 12, scale: 0.85 },
  CUDA:       { base: 8,  scale: 0.98 },
};

export function generateDemoData(): VariantsMap {
  const variants: VariantsMap = {};

  for (const [label, cfg] of Object.entries(VARIANT_CONFIGS)) {
    const rows: BPERow[] = [];
    let vocabSize = 250;
    let avgLen = 1.0;

    for (let step = 1; step <= 300; step++) {
      const pair = PAIRS[step % PAIRS.length];
      const decay = 1 / Math.log(step + 2);
      const freq = Math.round(2000 * decay + Math.random() * 200);
      const noise = (Math.random() - 0.5) * cfg.base * 0.3;
      const wallMs = Math.max(1, cfg.base * cfg.scale + noise + step * 0.02);
      vocabSize += step < 50 ? 2 : step < 150 ? 1 : 0.5;
      avgLen = 1 + step * 0.008;

      const row: BPERow = {
        step,
        pair_a: pair[0],
        pair_b: pair[1],
        freq,
        wall_ms: parseFloat(wallMs.toFixed(3)),
      };

      if (label === "Sequential") {
        row.vocab_size = Math.round(vocabSize);
        row.avg_tok_len = parseFloat(avgLen.toFixed(4));
      }

      rows.push(row);
    }

    variants[label] = rows;
  }

  return variants;
}
