/*
=============================================================
Parallel BPE Merge using CUDA
-------------------------------------------------------------
This program demonstrates how to perform BPE merge operations
using GPU parallelism.

Each GPU thread processes one word simultaneously.

Compile:
    nvcc -O2 bpe_cuda_parallel.cu -o bpe_cuda

Run:
    ./bpe_cuda dataset.txt
=============================================================
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <cuda_runtime.h>

/* Maximum limits for dataset and token representation */

#define MAX_WORDS 50000          // maximum number of words
#define MAX_WORD_LEN 128         // max characters in a word
#define MAX_SYMBOLS 128          // max tokens in one word
#define MAX_SYMBOL_LEN 32        // max length of each token
#define CUDA_BLOCK 256           // number of threads per block

/* ----------------------------------------------------------
   Word Structure
   Each word is stored as a sequence of symbols (tokens)
-----------------------------------------------------------*/
typedef struct {

    char symbols[MAX_SYMBOLS][MAX_SYMBOL_LEN]; // token list
    int nsyms;                                 // number of tokens

} Word;


/* ==========================================================
                CUDA KERNEL FUNCTION
==========================================================

This function runs on the GPU.

Each thread processes one word and performs
the merge operation if the pair is found.

==========================================================*/

__global__ void merge_kernel(
        char *d_syms,        // flattened symbol array in GPU memory
        int *d_nsyms,        // number of symbols per word
        int total_words,     // total number of words
        const char *d_left,  // left token of pair
        const char *d_right, // right token of pair
        const char *d_merge  // merged token
)
{
    /* --------------------------------------------------
       Compute global thread ID

       blockIdx.x  → block number
       blockDim.x  → threads per block
       threadIdx.x → thread index inside block

       Formula:
       global_thread_id = blockIdx.x * blockDim.x + threadIdx.x
    ---------------------------------------------------*/

    int wid = blockIdx.x * blockDim.x + threadIdx.x;

    /* If thread index exceeds word count → exit */

    if (wid >= total_words)
        return;

    /* --------------------------------------------------
       Convert flattened memory to 2D symbol array

       d_syms contains symbols of all words stored
       sequentially in memory.

       Each thread calculates the offset for its word.
    ---------------------------------------------------*/

    char (*syms)[MAX_SYMBOL_LEN] =
        (char (*)[MAX_SYMBOL_LEN])
        (d_syms + wid * MAX_SYMBOLS * MAX_SYMBOL_LEN);

    /* Get number of symbols in this word */

    int n = d_nsyms[wid];

    int i = 0;

    /* --------------------------------------------------
       Scan all token pairs in the word

       Example:
       l o w e r </w>

       pairs:
       (l,o)
       (o,w)
       (w,e)
       (e,r)
       (r,</w>)
    ---------------------------------------------------*/

    while (i < n - 1)
    {
        bool left_match = true;

        /* Check if first symbol matches left token */

        for (int k = 0; k < MAX_SYMBOL_LEN; k++)
        {
            if (syms[i][k] != d_left[k])
            {
                left_match = false;
                break;
            }

            if (d_left[k] == '\0')
                break;
        }

        if (!left_match)
        {
            i++;
            continue;
        }

        bool right_match = true;

        /* Check if second symbol matches right token */

        for (int k = 0; k < MAX_SYMBOL_LEN; k++)
        {
            if (syms[i + 1][k] != d_right[k])
            {
                right_match = false;
                break;
            }

            if (d_right[k] == '\0')
                break;
        }

        if (!right_match)
        {
            i++;
            continue;
        }

        /* --------------------------------------------------
           MERGE OPERATION

           Replace first symbol with merged token
        ---------------------------------------------------*/

        for (int k = 0; k < MAX_SYMBOL_LEN; k++)
            syms[i][k] = d_merge[k];

        /* --------------------------------------------------
           SHIFT TOKENS LEFT

           Remove the second symbol of the pair
        ---------------------------------------------------*/

        for (int j = i + 1; j < n - 1; j++)
        {
            for (int k = 0; k < MAX_SYMBOL_LEN; k++)
                syms[j][k] = syms[j + 1][k];
        }

        /* Reduce symbol count */

        n--;
    }

    /* Write updated token count back to GPU memory */

    d_nsyms[wid] = n;
}


/* ==========================================================
                 READ DATASET
==========================================================*/

int read_words(const char *file, Word *words)
{
    FILE *f = fopen(file, "r");

    if (!f)
    {
        printf("File not found\n");
        exit(1);
    }

    char buffer[MAX_WORD_LEN];
    int count = 0;

    while (fscanf(f, "%s", buffer) == 1)
    {
        if (count >= MAX_WORDS)
            break;

        int len = strlen(buffer);

        words[count].nsyms = 0;

        /* Convert word → characters */

        for (int i = 0; i < len; i++)
        {
            words[count].symbols[i][0] = buffer[i];
            words[count].symbols[i][1] = '\0';

            words[count].nsyms++;
        }

        /* add end-of-word token */

        strcpy(words[count].symbols[words[count].nsyms++], "</w>");

        count++;
    }

    fclose(f);

    return count;
}


/* ==========================================================
            FLATTEN WORD STRUCTURE FOR GPU
==========================================================*/

void flatten_words(
        Word *words,
        int total,
        char *flat,
        int *lens)
{
    for (int i = 0; i < total; i++)
    {
        lens[i] = words[i].nsyms;

        char (*dst)[MAX_SYMBOL_LEN] =
            (char (*)[MAX_SYMBOL_LEN])
            (flat + i * MAX_SYMBOLS * MAX_SYMBOL_LEN);

        for (int j = 0; j < words[i].nsyms; j++)
            strcpy(dst[j], words[i].symbols[j]);
    }
}


/* ==========================================================
            RESTORE WORDS AFTER GPU PROCESSING
==========================================================*/

void restore_words(
        Word *words,
        int total,
        char *flat,
        int *lens)
{
    for (int i = 0; i < total; i++)
    {
        words[i].nsyms = lens[i];

        char (*src)[MAX_SYMBOL_LEN] =
            (char (*)[MAX_SYMBOL_LEN])
            (flat + i * MAX_SYMBOLS * MAX_SYMBOL_LEN);

        for (int j = 0; j < lens[i]; j++)
            strcpy(words[i].symbols[j], src[j]);
    }
}


/* ==========================================================
                CUDA MERGE WRAPPER
==========================================================*/

void cuda_merge(
        Word *words,
        int total,
        const char *left,
        const char *right)
{
    /*
       One BPE step:
       1) flatten words for contiguous GPU memory access
       2) run merge kernel in parallel (1 thread = 1 word)
       3) copy results back and restore the Word structs
    */

    size_t sym_bytes = total * MAX_SYMBOLS * MAX_SYMBOL_LEN;

    /* Host memory */

    char *h_syms = (char*)malloc(sym_bytes);
    int *h_nsyms = (int*)malloc(total * sizeof(int));

    flatten_words(words, total, h_syms, h_nsyms);

    char merged[MAX_SYMBOL_LEN];

    snprintf(merged, MAX_SYMBOL_LEN, "%s%s", left, right);

    /* GPU memory pointers */

    char *d_syms;
    int *d_nsyms;

    char *d_left;
    char *d_right;
    char *d_merge;

    /* Allocate GPU memory */

    cudaMalloc(&d_syms, sym_bytes);
    cudaMalloc(&d_nsyms, total * sizeof(int));

    cudaMalloc(&d_left, MAX_SYMBOL_LEN);
    cudaMalloc(&d_right, MAX_SYMBOL_LEN);
    cudaMalloc(&d_merge, MAX_SYMBOL_LEN);

    /* Copy data CPU → GPU */

    cudaMemcpy(d_syms, h_syms, sym_bytes, cudaMemcpyHostToDevice);
    cudaMemcpy(d_nsyms, h_nsyms, total * sizeof(int), cudaMemcpyHostToDevice);

    cudaMemcpy(d_left, left, MAX_SYMBOL_LEN, cudaMemcpyHostToDevice);
    cudaMemcpy(d_right, right, MAX_SYMBOL_LEN, cudaMemcpyHostToDevice);
    cudaMemcpy(d_merge, merged, MAX_SYMBOL_LEN, cudaMemcpyHostToDevice);

    /* Calculate blocks needed */

    int blocks = (total + CUDA_BLOCK - 1) / CUDA_BLOCK;

    /* Launch CUDA kernel */

    merge_kernel<<<blocks, CUDA_BLOCK>>>(
        d_syms,
        d_nsyms,
        total,
        d_left,
        d_right,
        d_merge);

    /* Wait for GPU to finish */

    cudaDeviceSynchronize();

    /* Copy results GPU → CPU */

    cudaMemcpy(h_syms, d_syms, sym_bytes, cudaMemcpyDeviceToHost);
    cudaMemcpy(h_nsyms, d_nsyms, total * sizeof(int), cudaMemcpyDeviceToHost);

    restore_words(words, total, h_syms, h_nsyms);

    /* Free GPU memory */

    cudaFree(d_syms);
    cudaFree(d_nsyms);
    cudaFree(d_left);
    cudaFree(d_right);
    cudaFree(d_merge);

    free(h_syms);
    free(h_nsyms);
}


/* ==========================================================
                        MAIN
==========================================================*/

int main(int argc, char **argv)
{
    if (argc < 2)
    {
        printf("Usage: ./bpe_cuda dataset.txt\n");
        return 0;
    }

    Word words[MAX_WORDS];

    /* Load dataset into character-level symbols + </w> marker per word */
    int total = read_words(argv[1], words);

    printf("Loaded words: %d\n", total);

    const char *left = "e";
    const char *right = "r";

    /* Demo run: apply a single merge rule (e, r) -> er across all words */
    printf("Merging pair: %s + %s\n", left, right);

    cuda_merge(words, total, left, right);

    printf("\nSample Output:\n");

    /* Print first few transformed words to verify the merge effect */
    for (int i = 0; i < 10 && i < total; i++)
    {
        printf("Word %d: ", i);

        for (int j = 0; j < words[i].nsyms; j++)
            printf("%s ", words[i].symbols[j]);

        printf("\n");
    }

    return 0;
}