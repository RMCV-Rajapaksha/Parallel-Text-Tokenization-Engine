import { SectionTitle } from "./OverviewPanel";

export function DesignNotesPanel() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── BPE Algorithm ── */}
      <SectionTitle>Algorithm Design & Complexity</SectionTitle>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground">
          BPE Algorithm (Sennrich et al., 2016)
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Byte Pair Encoding tokenizes text by iteratively merging the most frequent adjacent symbol
          pair. Starting from individual characters, each merge step creates a new subword unit.
          After <em>N</em> merges, words are represented as sequences of learned subword tokens.
        </p>
        <div className="bg-[var(--surface-2)] rounded px-3.5 py-3 text-xs font-mono text-[#82c89a] leading-loose">
          <code>low → l o w &lt;/w&gt;</code><br />
          <code>lower → l o w e r &lt;/w&gt;</code><br />
          After merging <code className="text-[var(--omp)]">l</code>+<code className="text-[var(--omp)]">o</code>:<br />
          <code>lo w &lt;/w&gt; , lo w e r &lt;/w&gt;</code>
        </div>
      </div>

      {/* ── Complexity Table ── */}
      <SectionTitle>Complexity Analysis</SectionTitle>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 border-b border-border">Variant</th>
              <th className="px-3 py-2.5 border-b border-border">Pair Count</th>
              <th className="px-3 py-2.5 border-b border-border">Merge Apply</th>
              <th className="px-3 py-2.5 border-b border-border">Key Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-[#151c2a]">
              <td className="px-3 py-2.5 border-b border-[#1a2030] font-bold">
                <VarTag cls="seq">Sequential</VarTag>
              </td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030] text-muted-foreground">V = vocab size, L = avg token len</td>
            </tr>
            <tr className="hover:bg-[#151c2a]">
              <td className="px-3 py-2.5 border-b border-[#1a2030] font-bold">
                <VarTag cls="omp">OpenMP</VarTag>
              </td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L / T)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L / T)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030] text-muted-foreground">T threads; merge-table reduction O(T·H)</td>
            </tr>
            <tr className="hover:bg-[#151c2a]">
              <td className="px-3 py-2.5 border-b border-[#1a2030] font-bold">
                <VarTag cls="mpi">MPI</VarTag>
              </td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L / P)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030] text-muted-foreground">P ranks; apply replicated on all ranks</td>
            </tr>
            <tr className="hover:bg-[#151c2a]">
              <td className="px-3 py-2.5 border-b border-[#1a2030] font-bold">
                <VarTag cls="cuda">CUDA</VarTag>
              </td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L / G)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030]"><Code>O(V·L)</Code></td>
              <td className="px-3 py-2.5 border-b border-[#1a2030] text-muted-foreground">G GPU threads; PCIe transfer per step</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Bugs Fixed ── */}
      <SectionTitle>Bugs Fixed in Hybrid Version</SectionTitle>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 border-b border-border">#</th>
              <th className="px-3 py-2.5 border-b border-border">File</th>
              <th className="px-3 py-2.5 border-b border-border">Bug</th>
              <th className="px-3 py-2.5 border-b border-border">Fix</th>
            </tr>
          </thead>
          <tbody>
            <BugRow n={1} file="bpe_mpi_cuda.cu" bug="MPI_MAXLOC picks rank with highest local count → wrong merge" fix="MPI_Gatherv compact pair lists → rank 0 sums counts → broadcast true winner" />
            <BugRow n={2} file="bpe_mpi_cuda.cu" bug="Full word-array re-uploaded to GPU per step (~14 MB × 500 = 7 GB PCIe)" fix="apply_merge_kernel applies merge in-place; only ~68 bytes cross PCIe per step" />
            <BugRow n={3} file="bpe_cuda.cu, bpe_mpi_cuda.cu" bug="__syncthreads() inside divergent probe loop → UB / warp deadlock" fix="Removed; atomicCAS/atomicExch provide necessary ordering" />
            <BugRow n={4} file="bpe_mpi_cuda.cu" bug="Full 512K-slot pair tables sent over MPI (~36 MB/step/rank)" fix="Only non-empty slots packed into CPair list sent via MPI_Gatherv" />
          </tbody>
        </table>
      </div>

      {/* ── Bottlenecks ── */}
      <SectionTitle>Bottlenecks & Future Improvements</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-3">
            Current Bottlenecks
          </div>
          <ul className="text-muted-foreground text-xs leading-loose pl-4 list-disc space-y-1">
            <li><strong className="text-foreground">OpenMP:</strong> Hash-table merge phase is serial → limits scaling beyond ~8 threads</li>
            <li><strong className="text-foreground">MPI:</strong> Full-vocab apply after broadcast replicated on all ranks</li>
            <li><strong className="text-foreground">CUDA:</strong> PCIe round-trip per step dominates for small vocabularies</li>
          </ul>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-3">
            Proposed Improvements
          </div>
          <ul className="text-muted-foreground text-xs leading-loose pl-4 list-disc space-y-1">
            <li>Use a <strong className="text-foreground">min-heap / priority queue</strong> for O(log N) best-pair lookup</li>
            <li><strong className="text-foreground">Incremental update:</strong> only recount pairs involving the newly merged symbol</li>
            <li><strong className="text-foreground">GPU:</strong> keep vocabulary fully on device; only copy merge rule strings</li>
            <li><strong className="text-foreground">MPI + OpenMP hybrid:</strong> each MPI rank uses multiple OMP threads</li>
          </ul>
        </div>
      </div>

      {/* ── Colab Snippet ── */}
      <SectionTitle>Export Colab Snippet</SectionTitle>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-[10px] font-display font-bold uppercase tracking-[1px] text-muted-foreground mb-3">
          Add to your notebook to auto-export CSVs for this visualizer
        </div>
        <pre className="bg-[var(--surface-2)] rounded px-3.5 py-3 text-[11px] font-mono text-[#82c89a] leading-loose overflow-x-auto">{`# ── Export results for BPE Visualizer ──
from google.colab import files
import os

csv_files = ['seq_results.csv', 'omp_1t.csv', 'omp_2t.csv',
             f'omp_{"{NCORES}"}t.csv', 'mpi_1p.csv', 'mpi_2p.csv',
             'mpi_4p.csv', 'cuda_results.csv',
             'hybrid_1p.csv', 'hybrid_2p.csv', 'bpe_summary.csv']

print("Downloading available CSV files...")
for f in csv_files:
    if os.path.exists(f):
        files.download(f)
        print(f"  ✅ {f}")
    else:
        print(f"  ⏭  {f} not found")
print("Done! Drop these into the BPE Visualizer.")`}</pre>
      </div>
    </div>
  );
}

/* ── Small helpers ── */

function VarTag({ cls, children }: { cls: string; children: React.ReactNode }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    seq:  { bg: "#4c8ef520", fg: "var(--seq)" },
    omp:  { bg: "#f5a62320", fg: "var(--omp)" },
    mpi:  { bg: "#4caf7d20", fg: "var(--mpi)" },
    cuda: { bg: "#e0525220", fg: "var(--cuda)" },
  };
  const c = colorMap[cls] || colorMap.seq;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[11px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded text-[var(--omp)]">
      {children}
    </code>
  );
}

function BugRow({ n, file, bug, fix }: { n: number; file: string; bug: string; fix: string }) {
  return (
    <tr className="hover:bg-[#151c2a]">
      <td className="px-3 py-2.5 border-b border-[#1a2030]">{n}</td>
      <td className="px-3 py-2.5 border-b border-[#1a2030]">
        <code className="font-mono text-[11px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded text-[var(--omp)]">{file}</code>
      </td>
      <td className="px-3 py-2.5 border-b border-[#1a2030] text-muted-foreground">{bug}</td>
      <td className="px-3 py-2.5 border-b border-[#1a2030] text-muted-foreground">{fix}</td>
    </tr>
  );
}
