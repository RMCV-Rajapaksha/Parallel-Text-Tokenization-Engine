# Parallel Text Tokenization Engine

A high-performance text tokenization engine implemented using multiple parallel computing paradigms. The project tokenizes input text files, counts word frequencies using hash tables, and reports throughput statistics — serving as a benchmark for comparing **Serial**, **OpenMP**, **CUDA**, and **Hybrid** parallelization strategies.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Implementations](#implementations)
  - [Serial](#serial)
  - [OpenMP](#openmp)
  - [CUDA](#cuda)
  - [Hybrid](#hybrid)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Building & Running](#building--running)
  - [Serial](#build-serial)
  - [OpenMP](#build-openmp)
  - [CUDA](#build-cuda)
- [Dataset](#dataset)
- [Output Example](#output-example)

---

## Overview

This project explores the performance benefits of parallelizing a text tokenization workload across different hardware and software paradigms:

| Implementation | Parallelism Model | Hash Table Strategy |
|---|---|---|
| **Serial** | None (single-threaded) | Chained hash table |
| **OpenMP** | CPU multi-threading | Thread-local hash tables → merge |
| **CUDA** | GPU massively parallel | Open-addressed hash table on GPU |
| **Hybrid** | OpenMP + CUDA | *(Work in progress)* |

Each implementation reads an input text file, splits it into whitespace-delimited tokens, and records token frequencies in a hash table. Performance metrics such as total/unique token counts, processing time, throughput (tokens/sec), and hash table statistics are printed at the end.

---

## Project Structure

```
Parallel-Text-Tokenization-Engine/
├── Serial-implementation/
│   └── main.c              # Single-threaded baseline
├── OpenMP-implementation/
│   └── main.c              # CPU parallel with OpenMP
├── CUDA-implementation/
│   ├── main.cu             # GPU parallel with CUDA kernels
│   ├── main.c              # Placeholder (see main.cu)
│   └── Makefile            # Build script for CUDA version
├── Hybrid-implementation/
│   └── main.c              # Hybrid approach (WIP)
├── .gitignore
└── README.md
```

---

## Implementations

### Serial

A straightforward, single-threaded tokenizer that serves as the performance baseline.

- **Hash table**: Chained (linked-list buckets) with the **djb2** hash function.
- **Table size**: `100,003` (prime number for better distribution).
- **Timing**: Uses `clock()` for CPU time measurement.

### OpenMP

Parallelizes tokenization across multiple CPU threads using OpenMP.

- **Strategy**: The input text is divided into equal-sized chunks. Each thread tokenizes its chunk into a **thread-local hash table**, avoiding lock contention during the hot path.
- **Merge phase**: After all threads finish, the thread-local tables are merged into a single global table.
- **Boundary handling**: Partial tokens at chunk boundaries are handled by skipping to the next whitespace at the start of each chunk.
- **Thread count**: Configurable via command-line argument (default: `4`).
- **Timing**: Uses `omp_get_wtime()` for wall-clock time.

### CUDA

Offloads the entire tokenization and counting pipeline to the GPU.

- **Phase 1 — Tokenization kernel**: Each CUDA thread owns a window of characters and emits `(start, length)` token descriptors into a flat buffer using `atomicAdd`.
- **Phase 2 — Counting kernel**: Each thread takes one token descriptor and inserts/increments it in a GPU-resident **open-addressed hash table** using `atomicCAS` (slot claiming) and `atomicAdd` (frequency updates) with linear probing.
- **Phase 3 — Host copy-back**: Results are transferred to the host for statistics printing.
- **Hash table**: `131,072` slots (power of two), using the djb2 hash function on the device.
- **Timing**: Uses CUDA events (`cudaEventRecord` / `cudaEventElapsedTime`).

### Hybrid

A combined OpenMP + CUDA approach. *(Currently a work-in-progress placeholder.)*

---

## How It Works

1. **Read** the entire input text file into memory.
2. **Tokenize** the text by splitting on whitespace characters (spaces, tabs, newlines).
3. **Insert** each token into a hash table, incrementing its frequency if it already exists.
4. **Report** statistics:
   - Total token count
   - Unique token count
   - Processing time (seconds)
   - Throughput (tokens/second)
   - Hash table load factor, collision chain length, and empty bucket percentage

---

## Prerequisites

| Tool | Required For |
|---|---|
| **GCC** (or compatible C compiler) | Serial & OpenMP builds |
| **OpenMP** support (usually bundled with GCC) | OpenMP build |
| **NVIDIA CUDA Toolkit** (`nvcc`) | CUDA build |
| **NVIDIA GPU** with compute capability ≥ 6.0 | Running the CUDA version |

---

## Building & Running

### Build Serial

```bash
cd Serial-implementation
gcc -O2 -o tokenizer main.c
./tokenizer <input_file>
# Example:
./tokenizer ../ptbdataset/ptb.train.txt
```

### Build OpenMP

```bash
cd OpenMP-implementation
gcc -O2 -fopenmp -o tokenizer main.c
./tokenizer <input_file> [num_threads]
# Example:
./tokenizer ../ptbdataset/ptb.train.txt 8
```

### Build CUDA

```bash
cd CUDA-implementation
make                  # or: nvcc -O2 -arch=sm_60 -o cuda_tokenizer main.cu
./cuda_tokenizer <input_file>
# Example:
./cuda_tokenizer ../ptbdataset/ptb.train.txt
```

---

## Dataset

The project is designed to work with the **Penn Treebank (PTB)** dataset. Place the dataset files (e.g., `ptb.train.txt`) inside a `ptbdataset/` directory at the project root:

```
Parallel-Text-Tokenization-Engine/
└── ptbdataset/
    └── ptb.train.txt
```

> **Note:** The `ptbdataset/` directory is git-ignored and must be provided separately.

---

## Output Example

```
Serial Text Tokenization Engine
================================
Reading file: ../ptbdataset/ptb.train.txt
File size: 5101618 bytes

=== Serial Tokenization Statistics ===
Total tokens: 929589
Unique tokens: 9999
Processing time: 0.045123 seconds
Throughput: 20601234.56 tokens/second
Hash table load factor: 0.1000
Max collision chain: 4
Empty buckets: 90127 (90.10%)

Tokenization completed successfully!
```

---

## License

This project is for academic and research purposes.
