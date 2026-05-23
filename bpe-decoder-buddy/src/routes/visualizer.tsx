import { createFileRoute } from "@tanstack/react-router";
import { VisualizerPage } from "@/components/visualizer/VisualizerPage";

export const Route = createFileRoute("/visualizer")({
  head: () => ({
    meta: [
      { title: "BPE Parallel Engine — Visualizer Dashboard" },
      {
        name: "description",
        content:
          "Explore BPE tokenizer results from Sequential, OpenMP, MPI, CUDA, and Hybrid parallel implementations with interactive charts and analysis.",
      },
    ],
  }),
  component: VisualizerPage,
});
