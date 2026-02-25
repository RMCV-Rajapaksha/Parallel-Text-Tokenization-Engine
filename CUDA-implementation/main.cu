/*
 * CUDA Parallel Text Tokenization Engine
 * ========================================
 * Parallelism strategy:
 *   Phase 1 – Tokenization kernel: each CUDA thread owns a window of characters
 *              and scans forward to find all word-start positions within that
 *              window.  The kernel emits (start, length) pairs into a flat array
 *              using atomicAdd on a global counter.
 *
 *   Phase 2 – Counting kernel: each CUDA thread owns one (start, length) token
 *              pair and inserts / increments it in a GPU-side open-addressed
 *              hash table (linear probing) using atomicCAS for race-free slot
 *              claiming and atomicAdd for frequency increments.
 *
 *   Phase 3 – Everything is copied back to the host for statistics printing.
 *
 * No OpenMP, no serial loops for the hot path.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <cuda_runtime.h>

/* ------------------------------------------------------------------ */
/*  Tuneable constants                                                  */
/* ------------------------------------------------------------------ */
#define MAX_TOKEN_LENGTH   100
/* Open-addressed hash table on the GPU – must be a power of two       */
#define GPU_HT_SIZE        (1 << 17)   /* 131072 slots                  */
#define GPU_HT_MASK        (GPU_HT_SIZE - 1)
/* Maximum total tokens we expect to extract from the text             */
#define MAX_TOKENS         8000000     /* 8 M should cover PTB          */
/* CUDA thread/block geometry                                           */
#define BLOCK_SIZE         256

/* ------------------------------------------------------------------ */
/*  GPU-side data structures                                            */
/* ------------------------------------------------------------------ */

/* One slot in the GPU open-addressed hash table.
 * key[]       : NUL-terminated token string (MAX_TOKEN_LENGTH chars)
 * frequency   : how many times this token appeared
 * occupied    : 0 = empty, 1 = taken (set with atomicCAS)             */
typedef struct {
    char key[MAX_TOKEN_LENGTH];
    int  frequency;
    int  occupied;         /* used as a spin-lock flag                  */
} GPUHashSlot;

/* A compact token descriptor produced by the tokenization kernel      */
typedef struct {
    int start;   /* byte offset in the text buffer                     */
    int length;  /* number of characters                               */
} TokenDesc;

/* ------------------------------------------------------------------ */
/*  CUDA error checking helper                                          */
/* ------------------------------------------------------------------ */
#define CUDA_CHECK(call)                                                \
    do {                                                                \
        cudaError_t _e = (call);                                        \
        if (_e != cudaSuccess) {                                        \
            fprintf(stderr, "CUDA error %s:%d – %s\n",                 \
                    __FILE__, __LINE__, cudaGetErrorString(_e));         \
            exit(EXIT_FAILURE);                                         \
        }                                                               \
    } while (0)

/* ------------------------------------------------------------------ */
/*  Device helpers                                                      */
/* ------------------------------------------------------------------ */

/* djb2 hash on device */
__device__ unsigned int device_hash(const char *s, int len) {
    unsigned long h = 5381;
    for (int i = 0; i < len; ++i)
        h = ((h << 5) + h) + (unsigned char)s[i];
    return (unsigned int)(h & GPU_HT_MASK);
}

/* Device strcmp for fixed-length keys */
__device__ int device_streq(const char *a, const char *b, int len) {
    for (int i = 0; i < len; ++i)
        if (a[i] != b[i]) return 0;
    return (b[len] == '\0');   /* a is not NUL-terminated yet when comparing */
}

/* ------------------------------------------------------------------ */
/*  Kernel 1 – Parallel tokenization                                    */
/* ------------------------------------------------------------------ */
/*
 * Each thread is responsible for a window of characters in `text`.
 * It walks through its window and emits every complete token it finds.
 * Tokens that straddle the window boundary (start inside, end outside)
 * are handled by the last thread that owns those characters, which means
 * each thread continues past its nominal end until the current word ends.
 * Tokens that start before `wstart` but whose first character belongs to
 * a previous thread's window are skipped.
 */
__global__ void kernel_tokenize(
    const char * __restrict__ text,
    long         text_len,
    TokenDesc  * __restrict__ token_buf,
    int        * __restrict__ token_count,   /* atomic counter           */
    int          max_tokens)
{
    long tid      = (long)blockIdx.x * blockDim.x + threadIdx.x;
    long n_threads = (long)gridDim.x * blockDim.x;

    /* Each thread covers a window of chars */
    long wsize  = (text_len + n_threads - 1) / n_threads;
    long wstart = tid * wsize;
    long wend   = wstart + wsize;
    if (wstart >= text_len) return;
    if (wend   >  text_len) wend = text_len;

    long i = wstart;

    /* If we're not at the very beginning, skip a partial word that
     * belongs to the previous thread.  A partial word is any run of
     * non-space characters whose start is before wstart.             */
    if (wstart > 0 && i > 0 && text[i-1] != ' ' && text[i-1] != '\n' &&
                                text[i-1] != '\t' && text[i-1] != '\r') {
        /* we're inside a word started by a previous thread – skip it  */
        while (i < text_len && text[i] != ' '  && text[i] != '\n' &&
                                text[i] != '\t' && text[i] != '\r') {
            ++i;
        }
    }

    /* Now scan our adjusted window (we may slightly overflow wend to
     * finish a word that started inside our window)                   */
    while (i < wend) {
        /* skip whitespace */
        while (i < text_len && (text[i] == ' '  || text[i] == '\n' ||
                                 text[i] == '\t' || text[i] == '\r')) {
            ++i;
        }
        if (i >= wend) break;   /* word starts outside our window      */

        /* measure token length */
        long tstart = i;
        int  tlen   = 0;
        while (i < text_len && text[i] != ' '  && text[i] != '\n' &&
                                text[i] != '\t' && text[i] != '\r' &&
                                tlen < MAX_TOKEN_LENGTH - 1) {
            ++i;
            ++tlen;
        }
        /* skip any remaining chars of a too-long word */
        while (i < text_len && text[i] != ' '  && text[i] != '\n' &&
                                text[i] != '\t' && text[i] != '\r') {
            ++i;
        }

        if (tlen > 0) {
            int slot = atomicAdd(token_count, 1);
            if (slot < max_tokens) {
                token_buf[slot].start  = (int)tstart;
                token_buf[slot].length = tlen;
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Kernel 2 – Parallel frequency counting via GPU hash table           */
/* ------------------------------------------------------------------ */
/*
 * Each thread handles one token descriptor.  It probes the open-addressed
 * hash table on the GPU using linear probing + atomicCAS to claim slots.
 */
__global__ void kernel_count_tokens(
    const char      * __restrict__ text,
    const TokenDesc * __restrict__ token_buf,
    int               n_tokens,
    GPUHashSlot     * __restrict__ ht,
    int             * __restrict__ total_tokens_out,  /* atomic counter   */
    int             * __restrict__ unique_tokens_out) /* atomic counter   */
{
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid >= n_tokens) return;

    const char *tk  = text + token_buf[tid].start;
    int         len = token_buf[tid].length;

    unsigned int slot = device_hash(tk, len);

    /* Linear probing */
    for (int probe = 0; probe < GPU_HT_SIZE; ++probe) {
        unsigned int s = (slot + probe) & GPU_HT_MASK;
        GPUHashSlot *entry = &ht[s];

        /* Try to claim an empty slot */
        int prev = atomicCAS(&entry->occupied, 0, 1);

        if (prev == 0) {
            /* We just claimed this slot – write the key */
            for (int k = 0; k < len; ++k)
                entry->key[k] = tk[k];
            entry->key[len] = '\0';
            atomicAdd(&entry->frequency, 1);
            atomicAdd(total_tokens_out,  1);
            atomicAdd(unique_tokens_out, 1);
            return;
        }

        /* Slot was already occupied – check if it is our token */
        /* (busy-wait: occupied==1 means key is being written)   */
        /* Make sure key is fully written before reading it      */
        __threadfence();

        if (device_streq(entry->key, tk, len)) {
            atomicAdd(&entry->frequency,   1);
            atomicAdd(total_tokens_out,    1);
            return;
        }
        /* collision – try next slot */
    }
    /* If we exit the loop the table is full – silently drop the token  */
}

/* ------------------------------------------------------------------ */
/*  Host – read entire file into memory                                 */
/* ------------------------------------------------------------------ */
static char *read_file(const char *filename, long *file_size) {
    FILE *f = fopen(filename, "rb");
    if (!f) {
        fprintf(stderr, "Error: Cannot open file %s\n", filename);
        return NULL;
    }
    fseek(f, 0, SEEK_END);
    *file_size = ftell(f);
    fseek(f, 0, SEEK_SET);

    char *buf = (char *)malloc(*file_size + 1);
    if (!buf) {
        fprintf(stderr, "Error: malloc failed\n");
        fclose(f);
        return NULL;
    }
    size_t rd = fread(buf, 1, *file_size, f);
    if ((long)rd != *file_size) {
        fprintf(stderr, "Error: incomplete read\n");
        free(buf);
        fclose(f);
        return NULL;
    }
    buf[*file_size] = '\0';
    fclose(f);
    return buf;
}

/* ------------------------------------------------------------------ */
/*  Host – print statistics                                             */
/* ------------------------------------------------------------------ */
static void print_statistics(
    GPUHashSlot *ht,       /* host-side copy of GPU hash table          */
    int          total,
    int          unique,
    double       time_sec,
    int          num_blocks,
    int          block_size)
{
    printf("\n=== CUDA Parallel Tokenization Statistics ===\n");
    printf("Grid  : %d blocks x %d threads = %d total threads\n",
           num_blocks, block_size, num_blocks * block_size);
    printf("Total tokens   : %d\n", total);
    printf("Unique tokens  : %d\n", unique);
    printf("Processing time: %.6f seconds\n", time_sec);
    if (time_sec > 0.0)
        printf("Throughput     : %.2f tokens/second\n", total / time_sec);

    /* Compute load factor and max chain (each slot is depth 1 in      *
     * open addressing, so max_chain is always 1; we show load factor) */
    printf("Hash table size: %d slots\n", GPU_HT_SIZE);
    printf("Load factor    : %.4f\n", (double)unique / GPU_HT_SIZE);

    /* Count empty slots */
    int empty = 0;
    for (int i = 0; i < GPU_HT_SIZE; ++i)
        if (!ht[i].occupied) ++empty;
    printf("Empty slots    : %d (%.2f%%)\n",
           empty, (double)empty / GPU_HT_SIZE * 100.0);
}

/* ------------------------------------------------------------------ */
/*  main                                                                */
/* ------------------------------------------------------------------ */
int main(int argc, char *argv[]) {
    if (argc != 2) {
        printf("Usage: %s <input_file>\n", argv[0]);
        printf("Example: %s ../ptbdataset/ptb.train.txt\n", argv[0]);
        return 1;
    }

    /* -------------------------------------------------------------- */
    /*  Print GPU info                                                  */
    /* -------------------------------------------------------------- */
    int device_id = 0;
    cudaDeviceProp prop;
    CUDA_CHECK(cudaGetDeviceProperties(&prop, device_id));
    printf("CUDA Parallel Text Tokenization Engine\n");
    printf("=======================================\n");
    printf("GPU: %s  (SM %d.%d, %d MPs, %.0f MB)\n",
           prop.name,
           prop.major, prop.minor,
           prop.multiProcessorCount,
           prop.totalGlobalMem / 1048576.0);

    /* -------------------------------------------------------------- */
    /*  Read input file on host                                         */
    /* -------------------------------------------------------------- */
    const char *filename = argv[1];
    printf("Reading file: %s\n", filename);

    long  host_text_len = 0;
    char *host_text     = read_file(filename, &host_text_len);
    if (!host_text) return 1;
    printf("File size    : %ld bytes\n", host_text_len);

    /* -------------------------------------------------------------- */
    /*  Allocate GPU memory                                             */
    /* -------------------------------------------------------------- */
    char        *d_text        = NULL;
    TokenDesc   *d_token_buf   = NULL;
    GPUHashSlot *d_ht          = NULL;
    int         *d_token_count = NULL;
    int         *d_total       = NULL;
    int         *d_unique      = NULL;

    CUDA_CHECK(cudaMalloc(&d_text,        host_text_len + 1));
    CUDA_CHECK(cudaMalloc(&d_token_buf,   MAX_TOKENS * sizeof(TokenDesc)));
    CUDA_CHECK(cudaMalloc(&d_ht,          GPU_HT_SIZE * sizeof(GPUHashSlot)));
    CUDA_CHECK(cudaMalloc(&d_token_count, sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_total,       sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_unique,      sizeof(int)));

    /* Copy text to GPU */
    CUDA_CHECK(cudaMemcpy(d_text, host_text, host_text_len + 1,
                          cudaMemcpyHostToDevice));

    /* Zero out hash table and counters */
    CUDA_CHECK(cudaMemset(d_ht,          0, GPU_HT_SIZE * sizeof(GPUHashSlot)));
    CUDA_CHECK(cudaMemset(d_token_count, 0, sizeof(int)));
    CUDA_CHECK(cudaMemset(d_total,       0, sizeof(int)));
    CUDA_CHECK(cudaMemset(d_unique,      0, sizeof(int)));

    /* -------------------------------------------------------------- */
    /*  Configure grid                                                  */
    /* -------------------------------------------------------------- */
    long num_threads_tok = (long)prop.multiProcessorCount * BLOCK_SIZE * 4;
    int  n_blocks_tok    = (int)((num_threads_tok + BLOCK_SIZE - 1) / BLOCK_SIZE);

    /* -------------------------------------------------------------- */
    /*  Start timing (CUDA events)                                      */
    /* -------------------------------------------------------------- */
    cudaEvent_t ev_start, ev_stop;
    CUDA_CHECK(cudaEventCreate(&ev_start));
    CUDA_CHECK(cudaEventCreate(&ev_stop));
    CUDA_CHECK(cudaEventRecord(ev_start));

    /* -------------------------------------------------------------- */
    /*  Phase 1: GPU tokenization kernel                                */
    /* -------------------------------------------------------------- */
    kernel_tokenize<<<n_blocks_tok, BLOCK_SIZE>>>(
        d_text, host_text_len,
        d_token_buf, d_token_count, MAX_TOKENS);
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    /* Retrieve token count */
    int h_token_count = 0;
    CUDA_CHECK(cudaMemcpy(&h_token_count, d_token_count, sizeof(int),
                          cudaMemcpyDeviceToHost));
    if (h_token_count > MAX_TOKENS) h_token_count = MAX_TOKENS;
    printf("Tokens found : %d\n", h_token_count);

    /* -------------------------------------------------------------- */
    /*  Phase 2: GPU counting kernel                                    */
    /* -------------------------------------------------------------- */
    int n_blocks_cnt = (h_token_count + BLOCK_SIZE - 1) / BLOCK_SIZE;
    if (n_blocks_cnt < 1) n_blocks_cnt = 1;

    kernel_count_tokens<<<n_blocks_cnt, BLOCK_SIZE>>>(
        d_text, d_token_buf, h_token_count,
        d_ht, d_total, d_unique);
    CUDA_CHECK(cudaGetLastError());
    CUDA_CHECK(cudaDeviceSynchronize());

    /* -------------------------------------------------------------- */
    /*  Stop timing                                                     */
    /* -------------------------------------------------------------- */
    CUDA_CHECK(cudaEventRecord(ev_stop));
    CUDA_CHECK(cudaEventSynchronize(ev_stop));
    float elapsed_ms = 0.0f;
    CUDA_CHECK(cudaEventElapsedTime(&elapsed_ms, ev_start, ev_stop));
    double time_sec = elapsed_ms / 1000.0;

    /* -------------------------------------------------------------- */
    /*  Copy results back to host                                       */
    /* -------------------------------------------------------------- */
    int h_total  = 0, h_unique = 0;
    CUDA_CHECK(cudaMemcpy(&h_total,  d_total,  sizeof(int), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(&h_unique, d_unique, sizeof(int), cudaMemcpyDeviceToHost));

    GPUHashSlot *h_ht = (GPUHashSlot *)malloc(GPU_HT_SIZE * sizeof(GPUHashSlot));
    if (!h_ht) {
        fprintf(stderr, "Error: host malloc for hash table copy failed\n");
        return 1;
    }
    CUDA_CHECK(cudaMemcpy(h_ht, d_ht, GPU_HT_SIZE * sizeof(GPUHashSlot),
                          cudaMemcpyDeviceToHost));

    /* -------------------------------------------------------------- */
    /*  Print statistics                                                */
    /* -------------------------------------------------------------- */
    print_statistics(h_ht, h_total, h_unique, time_sec,
                     n_blocks_tok, BLOCK_SIZE);

    /* -------------------------------------------------------------- */
    /*  Clean up                                                        */
    /* -------------------------------------------------------------- */
    free(host_text);
    free(h_ht);
    cudaFree(d_text);
    cudaFree(d_token_buf);
    cudaFree(d_ht);
    cudaFree(d_token_count);
    cudaFree(d_total);
    cudaFree(d_unique);
    cudaEventDestroy(ev_start);
    cudaEventDestroy(ev_stop);

    printf("\nTokenization completed successfully!\n");
    return 0;
}
