#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <omp.h>

#define HASH_TABLE_SIZE 100003
#define SAMPLE_TOKENS 20


// Data structures

typedef struct TokenNode {
    char *token;
    int length;
    long long frequency;
    struct TokenNode *next;
} TokenNode;

typedef struct {
    TokenNode **buckets;
    int size;
    int unique_tokens;
    long long total_tokens;
} HashTable;

typedef struct {
    long start;
    int length;
} TokenSpan;

typedef struct {
    TokenSpan *items;
    long long count;
    long long capacity;
} SpanArray;


// Check whether a character belongs to a token
static int is_token_char(unsigned char c) {
    return isalnum(c) || c == '\'' || c == '_';
}


// Read entire file in binary mode
static char *read_file(const char *filename, long *file_size) {
    FILE *file = fopen(filename, "rb");
    if (file == NULL) {
        fprintf(stderr, "Error: Cannot open file %s\n", filename);
        return NULL;
    }

    fseek(file, 0, SEEK_END);
    *file_size = ftell(file);
    fseek(file, 0, SEEK_SET);

    char *content = (char *)malloc((*file_size > 0 ? *file_size : 1) + 1);
    if (content == NULL) {
        fprintf(stderr, "Error: Memory allocation failed\n");
        fclose(file);
        return NULL;
    }

    size_t bytes_read = fread(content, 1, *file_size, file);
    if ((long)bytes_read != *file_size) {
        fprintf(stderr, "Error: Failed to read complete file\n");
        free(content);
        fclose(file);
        return NULL;
    }

    content[*file_size] = '\0';
    fclose(file);
    return content;
}


// Hash function for a token slice (lowercased)
static unsigned int hash_token_slice(const char *token, int length, int table_size) {
    unsigned long hash = 5381;

    for (int i = 0; i < length; i++) {
        unsigned char c = (unsigned char)token[i];
        hash = ((hash << 5) + hash) + (unsigned char)tolower(c);
    }

    return (unsigned int)(hash % table_size);
}


// Create hash table
static HashTable *create_hash_table(int size) {
    HashTable *ht = (HashTable *)malloc(sizeof(HashTable));
    if (!ht) return NULL;

    ht->buckets = (TokenNode **)calloc(size, sizeof(TokenNode *));
    if (!ht->buckets) {
        free(ht);
        return NULL;
    }

    ht->size = size;
    ht->unique_tokens = 0;
    ht->total_tokens = 0;
    return ht;
}


// Compare stored token with a token slice
static int token_equals_slice(const TokenNode *node, const char *token, int length) {
    if (node->length != length) return 0;

    for (int i = 0; i < length; i++) {
        if (node->token[i] != (char)tolower((unsigned char)token[i])) {
            return 0;
        }
    }

    return 1;
}


// Insert token slice with a given count
static void insert_token_slice_with_count(HashTable *ht, const char *token, int length, long long count) {
    if (ht == NULL || token == NULL || length <= 0 || count <= 0) return;

    unsigned int index = hash_token_slice(token, length, ht->size);
    TokenNode *current = ht->buckets[index];

    while (current != NULL) {
        if (token_equals_slice(current, token, length)) {
            current->frequency += count;
            ht->total_tokens += count;
            return;
        }
        current = current->next;
    }

    TokenNode *new_node = (TokenNode *)malloc(sizeof(TokenNode));
    if (!new_node) return;

    new_node->token = (char *)malloc((size_t)length + 1);
    if (!new_node->token) {
        free(new_node);
        return;
    }

    for (int i = 0; i < length; i++) {
        new_node->token[i] = (char)tolower((unsigned char)token[i]);
    }
    new_node->token[length] = '\0';

    new_node->length = length;
    new_node->frequency = count;
    new_node->next = ht->buckets[index];
    ht->buckets[index] = new_node;

    ht->unique_tokens++;
    ht->total_tokens += count;
}


// Free hash table
static void free_hash_table(HashTable *ht) {
    if (!ht) return;

    for (int i = 0; i < ht->size; i++) {
        TokenNode *current = ht->buckets[i];
        while (current != NULL) {
            TokenNode *temp = current;
            current = current->next;
            free(temp->token);
            free(temp);
        }
    }

    free(ht->buckets);
    free(ht);
}


// Find a token node using a lowercase token string
static TokenNode *find_token_node(HashTable *ht, const char *token, int length) {
    if (!ht || !token || length <= 0) return NULL;

    unsigned int index = hash_token_slice(token, length, ht->size);
    TokenNode *current = ht->buckets[index];

    while (current != NULL) {
        if (current->length == length && memcmp(current->token, token, (size_t)length) == 0) {
            return current;
        }
        current = current->next;
    }

    return NULL;
}


// Compare two hash tables for correctness
static int compare_hash_tables(HashTable *a, HashTable *b) {
    if (!a || !b) return 0;
    if (a->total_tokens != b->total_tokens) return 0;
    if (a->unique_tokens != b->unique_tokens) return 0;

    for (int i = 0; i < a->size; i++) {
        TokenNode *current = a->buckets[i];
        while (current != NULL) {
            TokenNode *other = find_token_node(b, current->token, current->length);
            if (other == NULL || other->frequency != current->frequency) {
                return 0;
            }
            current = current->next;
        }
    }

    return 1;
}


// Initialize span array
static void init_span_array(SpanArray *arr) {
    arr->items = NULL;
    arr->count = 0;
    arr->capacity = 0;
}


// Append one token span
static int push_span(SpanArray *arr, long start, int length) {
    if (arr->count == arr->capacity) {
        long long new_capacity = (arr->capacity == 0) ? 1024 : arr->capacity * 2;
        TokenSpan *new_items = (TokenSpan *)realloc(arr->items, (size_t)new_capacity * sizeof(TokenSpan));
        if (!new_items) {
            return 0;
        }
        arr->items = new_items;
        arr->capacity = new_capacity;
    }

    arr->items[arr->count].start = start;
    arr->items[arr->count].length = length;
    arr->count++;
    return 1;
}


// Free span array
static void free_span_array(SpanArray *arr) {
    if (!arr) return;
    free(arr->items);
    arr->items = NULL;
    arr->count = 0;
    arr->capacity = 0;
}


// Sort token spans by original position
static int compare_spans(const void *a, const void *b) {
    const TokenSpan *left = (const TokenSpan *)a;
    const TokenSpan *right = (const TokenSpan *)b;

    if (left->start < right->start) return -1;
    if (left->start > right->start) return 1;
    return 0;
}


// Serial tokenization
static HashTable *tokenize_serial(const char *content, long file_size, double *time_taken) {
    double start_time = omp_get_wtime();
    HashTable *ht = create_hash_table(HASH_TABLE_SIZE);
    if (!ht) return NULL;

    for (long i = 0; i < file_size; i++) {
        unsigned char current = (unsigned char)content[i];
        unsigned char previous = (i == 0) ? 0 : (unsigned char)content[i - 1];

        if (is_token_char(current) && (i == 0 || !is_token_char(previous))) {
            long j = i;
            while (j < file_size && is_token_char((unsigned char)content[j])) {
                j++;
            }

            insert_token_slice_with_count(ht, content + i, (int)(j - i), 1);
            i = j - 1;
        }
    }

    *time_taken = omp_get_wtime() - start_time;
    return ht;
}


// Parallel tokenization using OpenMP
static HashTable *tokenize_parallel(const char *content,
                                    long file_size,
                                    int requested_threads,
                                    int *actual_threads,
                                    TokenSpan **ordered_spans,
                                    long long *ordered_count,
                                    double *time_taken) {
    omp_set_num_threads(requested_threads);

    SpanArray *thread_spans = (SpanArray *)calloc((size_t)requested_threads, sizeof(SpanArray));
    if (!thread_spans) return NULL;

    double start_time = omp_get_wtime();

    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        SpanArray local_spans;
        init_span_array(&local_spans);

        #pragma omp single
        {
            *actual_threads = omp_get_num_threads();
        }

        // Find token starts in parallel
        #pragma omp for schedule(static)
        for (long i = 0; i < file_size; i++) {
            unsigned char current = (unsigned char)content[i];
            unsigned char previous = (i == 0) ? 0 : (unsigned char)content[i - 1];

            if (is_token_char(current) && (i == 0 || !is_token_char(previous))) {
                long j = i;
                while (j < file_size && is_token_char((unsigned char)content[j])) {
                    j++;
                }

                if (!push_span(&local_spans, i, (int)(j - i))) {
                    fprintf(stderr, "Error: Token span allocation failed in thread %d\n", tid);
                }
            }
        }

        thread_spans[tid] = local_spans;
    }

    long long total_tokens = 0;
    for (int t = 0; t < *actual_threads; t++) {
        total_tokens += thread_spans[t].count;
    }

    TokenSpan *all_spans = NULL;
    if (total_tokens > 0) {
        all_spans = (TokenSpan *)malloc((size_t)total_tokens * sizeof(TokenSpan));
        if (!all_spans) {
            for (int t = 0; t < *actual_threads; t++) {
                free_span_array(&thread_spans[t]);
            }
            free(thread_spans);
            return NULL;
        }
    }

    long long offset = 0;
    for (int t = 0; t < *actual_threads; t++) {
        if (thread_spans[t].count > 0) {
            memcpy(all_spans + offset,
                   thread_spans[t].items,
                   (size_t)thread_spans[t].count * sizeof(TokenSpan));
            offset += thread_spans[t].count;
        }
        free_span_array(&thread_spans[t]);
    }
    free(thread_spans);

    if (total_tokens > 1) {
        qsort(all_spans, (size_t)total_tokens, sizeof(TokenSpan), compare_spans);
    }

    HashTable *ht = create_hash_table(HASH_TABLE_SIZE);
    if (!ht) {
        free(all_spans);
        return NULL;
    }

    // Build string tokens from the character spans
    for (long long i = 0; i < total_tokens; i++) {
        insert_token_slice_with_count(ht,
                                      content + all_spans[i].start,
                                      all_spans[i].length,
                                      1);
    }

    *ordered_spans = all_spans;
    *ordered_count = total_tokens;
    *time_taken = omp_get_wtime() - start_time;
    return ht;
}


// Print first few generated tokens
static void print_sample_tokens(const char *content, TokenSpan *spans, long long count) {
    long long limit = (count < SAMPLE_TOKENS) ? count : SAMPLE_TOKENS;

    printf("\nFirst %lld generated tokens:\n", limit);
    for (long long i = 0; i < limit; i++) {
        int length = spans[i].length;
        if (length > 40) length = 40;

        printf("%3lld. ", i + 1);
        for (int j = 0; j < length; j++) {
            putchar(content[spans[i].start + j]);
        }
        if (spans[i].length > 40) {
            printf("...");
        }
        printf("\n");
    }
}


// Print performance summary
static void print_statistics(HashTable *serial_ht,
                             HashTable *parallel_ht,
                             double serial_time,
                             double parallel_time,
                             int threads,
                             long file_size,
                             int correctness_ok) {
    int empty_buckets = 0;
    int max_chain = 0;

    for (int i = 0; i < parallel_ht->size; i++) {
        int chain_length = 0;
        TokenNode *current = parallel_ht->buckets[i];
        while (current != NULL) {
            chain_length++;
            current = current->next;
        }
        if (chain_length == 0) empty_buckets++;
        if (chain_length > max_chain) max_chain = chain_length;
    }

    printf("\n=== OpenMP Parallel Text Tokenization Statistics ===\n");
    printf("Threads used: %d\n", threads);
    printf("File size: %ld bytes\n", file_size);
    printf("Total tokens: %lld\n", parallel_ht->total_tokens);
    printf("Unique tokens: %d\n", parallel_ht->unique_tokens);
    printf("Serial time: %.6f seconds\n", serial_time);
    printf("Parallel time: %.6f seconds\n", parallel_time);

    if (parallel_time > 0.0) {
        printf("Parallel throughput: %.2f tokens/second\n", parallel_ht->total_tokens / parallel_time);
    }
    if (parallel_time > 0.0 && serial_time > 0.0) {
        printf("Speedup: %.2fx\n", serial_time / parallel_time);
    }

    printf("Correctness check against serial version: %s\n", correctness_ok ? "PASSED" : "FAILED");
    printf("Hash table load factor: %.4f\n", (double)parallel_ht->unique_tokens / parallel_ht->size);
    printf("Max collision chain: %d\n", max_chain);
    printf("Empty buckets: %d (%.2f%%)\n",
           empty_buckets,
           (double)empty_buckets / parallel_ht->size * 100.0);

    if (serial_ht->total_tokens != parallel_ht->total_tokens) {
        printf("Warning: Serial and parallel token counts are different\n");
    }
}


//-------------------- MAIN -------------------- //

int main(int argc, char *argv[]) {
    if (argc < 2 || argc > 3) {
        printf("Usage: %s <input_file> [num_threads]\n", argv[0]);
        printf("Example: %s ../ptbdataset/ptb.train.txt 8\n", argv[0]);
        return 1;
    }

    const char *filename = argv[1];
    int requested_threads = (argc == 3) ? atoi(argv[2]) : omp_get_max_threads();
    if (requested_threads <= 0) {
        requested_threads = omp_get_max_threads();
    }

    printf("\nOpenMP Parallel Text Tokenization Engine\n");
    printf("========================================\n");
    printf("Reading file: %s\n", filename);

    long file_size = 0;
    char *content = read_file(filename, &file_size);
    if (content == NULL) {
        return 1;
    }

    // Serial baseline
    double serial_time = 0.0;
    HashTable *serial_ht = tokenize_serial(content, file_size, &serial_time);
    if (serial_ht == NULL) {
        fprintf(stderr, "Error: Serial tokenization failed\n");
        free(content);
        return 1;
    }

    // OpenMP parallel tokenization
    int actual_threads = 0;
    TokenSpan *ordered_spans = NULL;
    long long ordered_count = 0;
    double parallel_time = 0.0;

    HashTable *parallel_ht = tokenize_parallel(content,
                                               file_size,
                                               requested_threads,
                                               &actual_threads,
                                               &ordered_spans,
                                               &ordered_count,
                                               &parallel_time);
    if (parallel_ht == NULL) {
        fprintf(stderr, "Error: Parallel tokenization failed\n");
        free_hash_table(serial_ht);
        free(content);
        return 1;
    }

    int correctness_ok = compare_hash_tables(serial_ht, parallel_ht);

    print_statistics(serial_ht,
                     parallel_ht,
                     serial_time,
                     parallel_time,
                     actual_threads,
                     file_size,
                     correctness_ok);

    if (ordered_count > 0) {
        print_sample_tokens(content, ordered_spans, ordered_count);
    }

    free(ordered_spans);
    free_hash_table(serial_ht);
    free_hash_table(parallel_ht);
    free(content);

    printf("\nTokenization completed successfully!\n");
    return 0;
}