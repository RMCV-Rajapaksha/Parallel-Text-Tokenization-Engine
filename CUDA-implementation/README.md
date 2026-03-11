# CUDA BPE Merge Implementation (`main.cu`)

This folder contains a CUDA-based demonstration of one **Byte Pair Encoding (BPE) merge step** applied in parallel.

## What This Program Does

The program:
1. Reads a text file as words.
2. Splits each word into character tokens.
3. Appends an end-of-word token `</w>`.
4. Runs one BPE merge rule (default: `e` + `r` -> `er`) on the GPU.
5. Prints sample transformed words.

Important: this is a **single merge pass demo**, not a full iterative BPE trainer.

## File Overview

- `main.cu`: Complete CUDA implementation.
- `Makefile`: Build helper for `nvcc`.
- `PTB_BPE_Efficiency.ipynb`, `PTB_BPE_Efficiency_Result.ipynb`: Notebook experiments/results.

## Data Model

The core structure is:

```c
typedef struct {
    char symbols[MAX_SYMBOLS][MAX_SYMBOL_LEN];
    int nsyms;
} Word;
```

- `symbols`: token sequence for one word.
- `nsyms`: current token count in that word.

Example for `lower` after load:
- `l`, `o`, `w`, `e`, `r`, `</w>`

## Constants

- `MAX_WORDS = 50000`: max words loaded from input.
- `MAX_WORD_LEN = 128`: max input word length.
- `MAX_SYMBOLS = 128`: max token slots per word.
- `MAX_SYMBOL_LEN = 32`: max chars per token.
- `CUDA_BLOCK = 256`: threads per block for kernel launch.

## Processing Pipeline

### 1. Read and tokenize on CPU (`read_words`)

- Reads whitespace-separated tokens using `fscanf`.
- Converts each character into a 1-char string token.
- Appends `</w>` token.

### 2. Flatten CPU structs for GPU (`flatten_words`)

GPU kernels prefer contiguous memory. The code converts `Word[]` into:
- `flat`: large linear `char` buffer holding all symbol strings.
- `lens`: array of symbol counts per word.

### 3. Copy buffers to GPU (`cuda_merge`)

Allocates and uploads:
- `d_syms` (all tokens),
- `d_nsyms` (symbol counts),
- `d_left`, `d_right`, `d_merge` (pair and merged token).

### 4. Run merge kernel (`merge_kernel`)

Thread mapping:
- 1 CUDA thread handles 1 word (`wid`).

Per word, the thread:
1. Scans adjacent token pairs `(syms[i], syms[i+1])`.
2. Compares with target pair (`left`, `right`).
3. If matched:
   - writes merged token into `syms[i]`,
   - shifts remaining tokens left to delete `syms[i+1]`,
   - decrements token count.

Because each thread writes only its own word region, no inter-thread locks are needed.

### 5. Copy results back and restore (`restore_words`)

- Downloads updated `d_syms` and `d_nsyms`.
- Reconstructs `Word[]` for easy CPU-side printing.

## Kernel Notes

- Global index is computed as:

```c
int wid = blockIdx.x * blockDim.x + threadIdx.x;
```

- Bounds check exits early when `wid >= total_words`.
- String matching is done character-by-character up to `MAX_SYMBOL_LEN` or null terminator.

## Main Function Behavior

`main` expects an input file path:

```bash
./bpe_cuda dataset.txt
```

Then it:
1. Loads words.
2. Sets demo merge pair (`left="e"`, `right="r"`).
3. Calls `cuda_merge` once.
4. Prints first 10 processed words.

## Build and Run

### Build (with `nvcc`)

```bash
nvcc -O2 main.cu -o bpe_cuda
```

Or use Makefile:

```bash
make
```

### Run

```bash
./bpe_cuda dataset.txt
```

On Windows PowerShell (if executable is built as `.exe`):

```powershell
.\bpe_cuda.exe dataset.txt
```

## Complexity (Single Merge Pass)

For each word, the thread may scan all adjacent pairs and shift on merges.
- Worst case per word: roughly `O(n^2)` due to repeated left shifts.
- Parallelism comes from processing many words simultaneously.

## Current Limitations

- Only one hard-coded pair merge per run (`e`, `r`).
- No iterative BPE training loop (no pair frequency learning across corpus).
- Uses fixed-size buffers; very long words or many symbols may be truncated by limits.
- Minimal CUDA error checking (no explicit `cudaGetLastError` checks).

## How To Extend

1. Add looped BPE training:
   - count pair frequencies,
   - select best pair,
   - call merge repeatedly.
2. Move pair-frequency counting to GPU.
3. Add CUDA error checks after memory ops and kernel launch.
4. Support configurable merge pairs from CLI arguments.
5. Add timing metrics for upload, kernel, and download phases.

## Quick Example

Input word: `lower`

Initial symbols:
- `l o w e r </w>`

Merge pair: `e + r`

After one pass:
- `l o w er </w>`

That is exactly the transformation this CUDA code performs in parallel across all loaded words.
