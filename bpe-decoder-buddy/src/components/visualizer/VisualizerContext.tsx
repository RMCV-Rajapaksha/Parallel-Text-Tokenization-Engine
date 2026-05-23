import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import type { BPERow, VariantsMap } from "@/lib/csv";
import { parseCSV, inferLabel } from "@/lib/csv";
import { generateDemoData } from "@/lib/demoData";

interface VisualizerState {
  variants: VariantsMap;
  isDemo: boolean;
  loadCSVFiles: (files: FileList | File[]) => Promise<string[]>;
  reset: () => void;
}

const Ctx = createContext<VisualizerState | null>(null);

export function useVisualizer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVisualizer must be inside VisualizerProvider");
  return ctx;
}

// Derived helpers consumers can call with the variants map
export function getSummaryStats(variants: VariantsMap) {
  const keys = Object.keys(variants);
  let maxMerges = 0;
  keys.forEach((k) => (maxMerges = Math.max(maxMerges, variants[k].length)));

  const seqData = variants["Sequential"];
  let maxSpeedup = 1;
  let fastest = "—";

  if (seqData) {
    const seqTotal = seqData.reduce((s, r) => s + (r.wall_ms || 0), 0);
    let best = 1;
    keys.forEach((k) => {
      const total = variants[k].reduce((s, r) => s + (r.wall_ms || 0), 0);
      const sp = seqTotal / total;
      if (sp > best) {
        best = sp;
        fastest = k;
      }
    });
    maxSpeedup = best;
  }

  return { totalMerges: maxMerges, variantCount: keys.length, maxSpeedup, fastest };
}

export function getPercentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

export function VisualizerProvider({ children }: { children: ReactNode }) {
  const [variants, setVariants] = useState<VariantsMap>({});
  const [isDemo, setIsDemo] = useState(false);

  // Auto-load demo data on mount
  useEffect(() => {
    const demo = generateDemoData();
    setVariants(demo);
    setIsDemo(true);
  }, []);

  const loadCSVFiles = useCallback(
    async (files: FileList | File[]): Promise<string[]> => {
      const fileArr = Array.from(files).filter((f) => f.name.endsWith(".csv"));
      const labels: string[] = [];

      for (const file of fileArr) {
        const text = await file.text();
        const data = parseCSV(text);
        const label = inferLabel(file.name);
        labels.push(label);
        setVariants((prev) => ({ ...prev, [label]: data }));
      }

      if (labels.length > 0) setIsDemo(false);
      return labels;
    },
    [],
  );

  const reset = useCallback(() => {
    const demo = generateDemoData();
    setVariants(demo);
    setIsDemo(true);
  }, []);

  const value = useMemo(
    () => ({ variants, isDemo, loadCSVFiles, reset }),
    [variants, isDemo, loadCSVFiles, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
