// CSV parsing, label inference, color system — ported from main.html

export interface BPERow {
  step: number;
  pair_a: string;
  pair_b: string;
  freq: number;
  wall_ms: number;
  vocab_size?: number;
  avg_tok_len?: number;
  [key: string]: string | number | undefined;
}

export type VariantsMap = Record<string, BPERow[]>;

/**
 * Parse CSV text into an array of objects keyed by header names.
 * Handles quoted fields (commas inside quotes are not split).
 */
export function parseCSV(text: string): BPERow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const parts: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        parts.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    const obj: Record<string, string | number> = {};
    header.forEach((h, i) => {
      const v = (parts[i] || "").trim();
      obj[h] = isNaN(Number(v)) || v === "" ? v : Number(v);
    });
    return obj as unknown as BPERow;
  });
}

/**
 * Infer a human-readable variant label from a CSV filename.
 */
export function inferLabel(filename: string): string {
  const f = filename.toLowerCase().replace(".csv", "");
  if (f.includes("seq")) return "Sequential";
  if (f.includes("hybrid")) {
    const m = f.match(/(\d+)p/);
    return m ? `Hybrid-${m[1]}p` : "Hybrid";
  }
  if (f.includes("cuda")) return "CUDA";
  const ompMatch = f.match(/omp.*?(\d+)t/);
  if (ompMatch) return `OMP-${ompMatch[1]}t`;
  const mpiMatch = f.match(/mpi.*?(\d+)p/);
  if (mpiMatch) return `MPI-${mpiMatch[1]}p`;
  return filename.replace(".csv", "");
}

/** Variant colour map */
export const VAR_COLORS: Record<string, string> = {
  Sequential: "#4c8ef5",
  "OMP-1t": "#7aa8f0",
  "OMP-2t": "#f5a623",
  "OMP-4t": "#f0b84c",
  "OMP-8t": "#e0522a",
  "OMP-16t": "#ff6b4a",
  "MPI-1p": "#4caf7d",
  "MPI-2p": "#6ac98f",
  "MPI-4p": "#2e7d4f",
  CUDA: "#8172b2",
  "Hybrid-1p": "#b06ef5",
  "Hybrid-2p": "#c98cff",
};

export function varColor(label: string): string {
  if (VAR_COLORS[label]) return VAR_COLORS[label];
  for (const k of Object.keys(VAR_COLORS)) {
    if (label.toLowerCase().includes(k.toLowerCase().split("-")[0]))
      return VAR_COLORS[k];
  }
  return "#5a6585";
}

/** Classify a variant label into a CSS class name */
export function varClass(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("seq")) return "seq";
  if (l.includes("omp")) return "omp";
  if (l.includes("hybrid")) return "hybrid";
  if (l.includes("cuda")) return "cuda";
  if (l.includes("mpi")) return "mpi";
  return "seq";
}

/** Format a number with k/M suffix or fixed decimals */
export function fmtN(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
  if (v >= 100) return Math.round(v).toString();
  return v.toFixed(2);
}
