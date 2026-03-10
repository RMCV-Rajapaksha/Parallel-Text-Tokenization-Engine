#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <omp.h>

#define MAX_TOKEN_LENGTH 100
#define MAX_SYMBOL_LEN 50
#define HASH_TABLE_SIZE 100003
#define MAX_PAIRS 10000
#define SAMPLE_WORDS 20


// BPE word: a single vocabulary entry split into symbols
typedef struct {
    char **symbols;
    int num_symbols;
    int frequency;
} BPEWord;

// BPE vocabulary: all unique words and their symbol sequences
typedef struct {
    BPEWord *words;
    int vocab_size;
} BPEVocab;

// Best adjacent symbol pair found during a merge round
typedef struct {
    char left[MAX_SYMBOL_LEN];
    char right[MAX_SYMBOL_LEN];
    int frequency;
} BestPair;

// Hash table node for word frequency counting
typedef struct WordNode {
    char *word;
    int frequency;
    struct WordNode *next;
} WordNode;

// Vocab index node for fast word lookup
typedef struct VocabIndexNode {
    char *key;
    int vocab_idx;
    struct VocabIndexNode *next;
} VocabIndexNode;

// Vocab index for O(1) word-to-vocab lookup
typedef struct {
    VocabIndexNode **buckets;
} VocabIndex;


// Hash function (djb2 algorithm)
static unsigned int hash_function(const char *str, int table_size) {
    unsigned long hash = 5381;
    int c;
    while ((c = (unsigned char)*str++)) {
        hash = ((hash << 5) + hash) + c;
    }
    return (unsigned int)(hash % table_size);
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


// Build word frequency table from text using OpenMP parallel word extraction
static BPEVocab *build_vocab_parallel(const char *text, long file_size,
                                      int requested_threads, int *actual_threads) {
    omp_set_num_threads(requested_threads);

    // Each thread collects its own local hash table of word frequencies
    WordNode ***thread_buckets = (WordNode ***)calloc(requested_threads, sizeof(WordNode **));
    int *thread_unique = (int *)calloc(requested_threads, sizeof(int));

    #pragma omp parallel
    {
        int tid = omp_get_thread_num();

        #pragma omp single
        {
            *actual_threads = omp_get_num_threads();
        }

        // Allocate local hash table for this thread
        WordNode **local_buckets = (WordNode **)calloc(HASH_TABLE_SIZE, sizeof(WordNode *));
        thread_buckets[tid] = local_buckets;
        int local_unique = 0;

        // Each thread scans characters and finds word starts
        #pragma omp for schedule(static)
        for (long i = 0; i < file_size; i++) {
            unsigned char c = (unsigned char)text[i];
            unsigned char prev = (i == 0) ? ' ' : (unsigned char)text[i - 1];

            // Detect start of a word (non-space after space)
            if (!isspace(c) && (i == 0 || isspace(prev))) {
                char token[MAX_TOKEN_LENGTH];
                int token_len = 0;
                long j = i;

                // Extract the full word
                while (j < file_size && !isspace((unsigned char)text[j])
                       && token_len < MAX_TOKEN_LENGTH - 1) {
                    token[token_len++] = text[j++];
                }
                token[token_len] = '\0';

                // Append end-of-word marker
                char word_eow[MAX_TOKEN_LENGTH + 4];
                snprintf(word_eow, sizeof(word_eow), "%s</w>", token);

                // Insert into thread-local hash table
                unsigned int idx = hash_function(word_eow, HASH_TABLE_SIZE);
                WordNode *cur = local_buckets[idx];
                int found = 0;
                while (cur != NULL) {
                    if (strcmp(cur->word, word_eow) == 0) {
                        cur->frequency++;
                        found = 1;
                        break;
                    }
                    cur = cur->next;
                }
                if (!found) {
                    WordNode *node = (WordNode *)malloc(sizeof(WordNode));
                    node->word = strdup(word_eow);
                    node->frequency = 1;
                    node->next = local_buckets[idx];
                    local_buckets[idx] = node;
                    local_unique++;
                }
            }
        }

        thread_unique[tid] = local_unique;
    }

    // Merge all thread-local hash tables into one global table
    WordNode **global_buckets = (WordNode **)calloc(HASH_TABLE_SIZE, sizeof(WordNode *));
    int global_unique = 0;

    for (int t = 0; t < *actual_threads; t++) {
        if (thread_buckets[t] == NULL) continue;
        for (int b = 0; b < HASH_TABLE_SIZE; b++) {
            WordNode *cur = thread_buckets[t][b];
            while (cur != NULL) {
                WordNode *next = cur->next;

                unsigned int idx = hash_function(cur->word, HASH_TABLE_SIZE);
                WordNode *gcur = global_buckets[idx];
                int found = 0;
                while (gcur != NULL) {
                    if (strcmp(gcur->word, cur->word) == 0) {
                        gcur->frequency += cur->frequency;
                        found = 1;
                        break;
                    }
                    gcur = gcur->next;
                }

                if (!found) {
                    cur->next = global_buckets[idx];
                    global_buckets[idx] = cur;
                    global_unique++;
                } else {
                    free(cur->word);
                    free(cur);
                }

                cur = next;
            }
        }
        free(thread_buckets[t]);
    }
    free(thread_buckets);
    free(thread_unique);

    // Convert global hash table into BPEVocab (split each word into character symbols)
    BPEVocab *vocab = (BPEVocab *)malloc(sizeof(BPEVocab));
    vocab->words = (BPEWord *)malloc(global_unique * sizeof(BPEWord));
    vocab->vocab_size = 0;

    for (int b = 0; b < HASH_TABLE_SIZE; b++) {
        WordNode *cur = global_buckets[b];
        while (cur != NULL) {
            int vi = vocab->vocab_size;
            int len = (int)strlen(cur->word);

            vocab->words[vi].symbols = (char **)malloc(len * sizeof(char *));
            vocab->words[vi].num_symbols = 0;
            vocab->words[vi].frequency = cur->frequency;

            // Split word into individual characters, keeping </w> as one symbol
            int pos = 0;
            while (pos < len) {
                if (pos + 3 < len && cur->word[pos] == '<' && cur->word[pos + 1] == '/'
                    && cur->word[pos + 2] == 'w' && cur->word[pos + 3] == '>') {
                    vocab->words[vi].symbols[vocab->words[vi].num_symbols] = strdup("</w>");
                    vocab->words[vi].num_symbols++;
                    pos += 4;
                } else {
                    char ch[2] = {cur->word[pos], '\0'};
                    vocab->words[vi].symbols[vocab->words[vi].num_symbols] = strdup(ch);
                    vocab->words[vi].num_symbols++;
                    pos++;
                }
            }

            vocab->vocab_size++;
            WordNode *temp = cur;
            cur = cur->next;
            free(temp->word);
            free(temp);
        }
    }
    free(global_buckets);

    return vocab;
}


// Find the most frequent adjacent symbol pair using OpenMP
static BestPair find_best_pair_parallel(BPEVocab *vocab) {
    BestPair global_best = {"", "", 0};

    // Each thread tracks its own pair frequencies and finds a local best
    #pragma omp parallel
    {
        char local_left[MAX_PAIRS][MAX_SYMBOL_LEN];
        char local_right[MAX_PAIRS][MAX_SYMBOL_LEN];
        int local_counts[MAX_PAIRS];
        int local_unique = 0;
        BestPair local_best = {"", "", 0};

        memset(local_counts, 0, sizeof(local_counts));

        // Distribute words across threads
        #pragma omp for schedule(static)
        for (int i = 0; i < vocab->vocab_size; i++) {
            BPEWord *word = &vocab->words[i];

            // Look at each adjacent symbol pair in this word
            for (int j = 0; j < word->num_symbols - 1; j++) {
                char *left = word->symbols[j];
                char *right = word->symbols[j + 1];

                // Search for this pair in local tracker
                int found = 0;
                for (int k = 0; k < local_unique; k++) {
                    if (strcmp(local_left[k], left) == 0 &&
                        strcmp(local_right[k], right) == 0) {
                        local_counts[k] += word->frequency;
                        found = 1;

                        if (local_counts[k] > local_best.frequency) {
                            strcpy(local_best.left, left);
                            strcpy(local_best.right, right);
                            local_best.frequency = local_counts[k];
                        }
                        break;
                    }
                }

                if (!found && local_unique < MAX_PAIRS) {
                    strcpy(local_left[local_unique], left);
                    strcpy(local_right[local_unique], right);
                    local_counts[local_unique] = word->frequency;

                    if (local_counts[local_unique] > local_best.frequency) {
                        strcpy(local_best.left, left);
                        strcpy(local_best.right, right);
                        local_best.frequency = local_counts[local_unique];
                    }
                    local_unique++;
                }
            }
        }

        // Reduce: pick the global best across all threads
        #pragma omp critical
        {
            if (local_best.frequency > global_best.frequency) {
                global_best = local_best;
            }
        }
    }

    return global_best;
}


// Merge the best pair across all vocabulary words using OpenMP
static void merge_pair_parallel(BPEVocab *vocab, const char *left, const char *right) {
    #pragma omp parallel for schedule(static)
    for (int i = 0; i < vocab->vocab_size; i++) {
        BPEWord *word = &vocab->words[i];

        char **new_symbols = (char **)malloc(word->num_symbols * sizeof(char *));
        int new_count = 0;

        for (int j = 0; j < word->num_symbols; j++) {
            // Check if current + next symbol match the target pair
            if (j < word->num_symbols - 1 &&
                strcmp(word->symbols[j], left) == 0 &&
                strcmp(word->symbols[j + 1], right) == 0) {

                // Merge the two symbols into one (e.g. "e" + "r" -> "er")
                char merged[MAX_SYMBOL_LEN * 2];
                strcpy(merged, left);
                strcat(merged, right);

                new_symbols[new_count] = strdup(merged);
                new_count++;
                j++;            // Skip the next symbol
            } else {
                new_symbols[new_count] = strdup(word->symbols[j]);
                new_count++;
            }
        }

        // Free old symbols and assign new ones
        for (int j = 0; j < word->num_symbols; j++) {
            free(word->symbols[j]);
        }
        free(word->symbols);

        word->symbols = new_symbols;
        word->num_symbols = new_count;
    }
}


// Train BPE by performing iterative merges
static void train_bpe_parallel(BPEVocab *vocab, int target_merges) {
    printf("Starting BPE Training for %d merges...\n", target_merges);

    for (int i = 0; i < target_merges; i++) {
        BestPair best = find_best_pair_parallel(vocab);

        if (best.frequency == 0) {
            printf("Training stopped: No more pairs to merge.\n");
            break;
        }

        printf("Merge %d: '%s' + '%s' (Frequency: %d)\n",
               i + 1, best.left, best.right, best.frequency);

        merge_pair_parallel(vocab, best.left, best.right);
    }

    printf("BPE Training Complete.\n");
}


// Build a lookup index for fast word->vocab mapping
static VocabIndex *build_vocab_index(BPEVocab *vocab) {
    VocabIndex *vi = (VocabIndex *)malloc(sizeof(VocabIndex));
    vi->buckets = (VocabIndexNode **)calloc(HASH_TABLE_SIZE, sizeof(VocabIndexNode *));

    for (int i = 0; i < vocab->vocab_size; i++) {
        // Reconstruct the full word from its symbols
        char reconstructed[MAX_TOKEN_LENGTH * 2] = "";
        for (int j = 0; j < vocab->words[i].num_symbols; j++) {
            strcat(reconstructed, vocab->words[i].symbols[j]);
        }

        unsigned int h = hash_function(reconstructed, HASH_TABLE_SIZE);
        VocabIndexNode *node = (VocabIndexNode *)malloc(sizeof(VocabIndexNode));
        node->key = strdup(reconstructed);
        node->vocab_idx = i;
        node->next = vi->buckets[h];
        vi->buckets[h] = node;
    }

    return vi;
}


// Look up a word in the vocab index
static int vocab_index_lookup(VocabIndex *vi, const char *key) {
    unsigned int h = hash_function(key, HASH_TABLE_SIZE);
    VocabIndexNode *cur = vi->buckets[h];
    while (cur != NULL) {
        if (strcmp(cur->key, key) == 0) return cur->vocab_idx;
        cur = cur->next;
    }
    return -1;
}


// Free vocab index
static void free_vocab_index(VocabIndex *vi) {
    if (!vi) return;
    for (int i = 0; i < HASH_TABLE_SIZE; i++) {
        VocabIndexNode *cur = vi->buckets[i];
        while (cur != NULL) {
            VocabIndexNode *tmp = cur;
            cur = cur->next;
            free(tmp->key);
            free(tmp);
        }
    }
    free(vi->buckets);
    free(vi);
}


// Tokenize full text using trained BPE and count totals
static void tokenize_text_bpe(const char *text, BPEVocab *vocab, VocabIndex *vi,
                               int *total_words, int *total_subwords) {
    char token[MAX_TOKEN_LENGTH];
    int token_index = 0;
    int i = 0;
    *total_words = 0;
    *total_subwords = 0;

    while (text[i] != '\0') {
        // Skip whitespace
        while (text[i] != '\0' && isspace((unsigned char)text[i])) i++;

        token_index = 0;
        while (text[i] != '\0' && !isspace((unsigned char)text[i])
               && token_index < MAX_TOKEN_LENGTH - 1) {
            token[token_index++] = text[i++];
        }

        if (token_index > 0) {
            token[token_index] = '\0';
            (*total_words)++;

            char word_eow[MAX_TOKEN_LENGTH + 4];
            snprintf(word_eow, sizeof(word_eow), "%s</w>", token);

            int idx = vocab_index_lookup(vi, word_eow);
            if (idx >= 0) {
                *total_subwords += vocab->words[idx].num_symbols;
            }
        }
    }
}


// Count unique BPE subword tokens across the vocabulary
static int count_unique_bpe_tokens(BPEVocab *vocab) {
    char unique_tokens[10000][MAX_SYMBOL_LEN * 2];
    int unique_count = 0;

    for (int i = 0; i < vocab->vocab_size; i++) {
        for (int j = 0; j < vocab->words[i].num_symbols; j++) {
            int found = 0;
            for (int k = 0; k < unique_count; k++) {
                if (strcmp(unique_tokens[k], vocab->words[i].symbols[j]) == 0) {
                    found = 1;
                    break;
                }
            }
            if (!found && unique_count < 10000) {
                strcpy(unique_tokens[unique_count], vocab->words[i].symbols[j]);
                unique_count++;
            }
        }
    }
    return unique_count;
}


// Print sample BPE tokenizations
static void print_sample_tokenizations(BPEVocab *vocab, VocabIndex *vi) {
    const char *sample_words[] = {"the", "of", "and", "to", "in", "is", "that", "it"};
    int num_samples = 8;

    printf("\n=== Sample BPE Tokenizations ===\n");
    for (int i = 0; i < num_samples; i++) {
        char word_eow[MAX_TOKEN_LENGTH + 4];
        snprintf(word_eow, sizeof(word_eow), "%s</w>", sample_words[i]);

        int idx = vocab_index_lookup(vi, word_eow);
        if (idx >= 0) {
            printf("  '%s' -> [", sample_words[i]);
            for (int j = 0; j < vocab->words[idx].num_symbols; j++) {
                printf("'%s'", vocab->words[idx].symbols[j]);
                if (j < vocab->words[idx].num_symbols - 1) printf(", ");
            }
            printf("]\n");
        } else {
            printf("  '%s' -> [not found in vocab]\n", sample_words[i]);
        }
    }
}


// Free BPE vocabulary
static void free_vocab(BPEVocab *vocab) {
    if (!vocab) return;
    for (int i = 0; i < vocab->vocab_size; i++) {
        for (int j = 0; j < vocab->words[i].num_symbols; j++) {
            free(vocab->words[i].symbols[j]);
        }
        free(vocab->words[i].symbols);
    }
    free(vocab->words);
    free(vocab);
}


// Print performance summary
static void print_statistics(BPEVocab *vocab, int total_words, int total_subwords,
                             int unique_bpe_tokens, int num_merges,
                             double time_taken, int threads, long file_size) {
    printf("\n=== OpenMP Parallel BPE Tokenization Statistics ===\n");
    printf("Threads used: %d\n", threads);
    printf("File size: %ld bytes\n", file_size);
    printf("Total words in text: %d\n", total_words);
    printf("Unique words in vocabulary: %d\n", vocab->vocab_size);
    printf("Number of BPE merges performed: %d\n", num_merges);
    printf("Unique BPE tokens (subword units): %d\n", unique_bpe_tokens);
    printf("Total subword tokens after BPE: %d\n", total_subwords);
    if (total_words > 0) {
        printf("Average subwords per word: %.2f\n", (double)total_subwords / total_words);
    }
    printf("Processing time: %.6f seconds\n", time_taken);
    if (time_taken > 0.0) {
        printf("Throughput: %.2f words/second\n", total_words / time_taken);
    }
}


//-------------------- MAIN -------------------- //

int main(int argc, char *argv[]) {
    if (argc < 2 || argc > 4) {
        printf("Usage: %s <input_file> [num_threads] [num_merges]\n", argv[0]);
        printf("Example: %s ../ptbdataset/ptb.train.txt 8 50\n", argv[0]);
        return 1;
    }

    const char *filename = argv[1];
    int requested_threads = (argc >= 3) ? atoi(argv[2]) : omp_get_max_threads();
    if (requested_threads <= 0) {
        requested_threads = omp_get_max_threads();
    }

    int num_merges = 50;            // Default number of BPE merges
    if (argc == 4) {
        num_merges = atoi(argv[3]);
        if (num_merges <= 0) {
            fprintf(stderr, "Error: num_merges must be a positive integer\n");
            return 1;
        }
    }

    printf("\nOpenMP Parallel BPE Tokenization Engine\n");
    printf("========================================\n");
    printf("Reading file: %s\n", filename);

    long file_size = 0;
    char *content = read_file(filename, &file_size);
    if (content == NULL) {
        return 1;
    }
    printf("File size: %ld bytes\n", file_size);

    double start_time = omp_get_wtime();

    // Build vocabulary from text (parallel word extraction)
    int actual_threads = 0;
    printf("Building vocabulary...\n");
    BPEVocab *vocab = build_vocab_parallel(content, file_size,
                                           requested_threads, &actual_threads);
    if (vocab == NULL) {
        fprintf(stderr, "Error: Failed to build vocabulary\n");
        free(content);
        return 1;
    }
    printf("Vocabulary built: %d unique words\n", vocab->vocab_size);

    // Train BPE (parallel pair finding and merging)
    train_bpe_parallel(vocab, num_merges);

    double end_time = omp_get_wtime();
    double time_taken = end_time - start_time;

    // Build vocab index for fast lookup
    VocabIndex *vi = build_vocab_index(vocab);

    // Tokenize full text and count totals
    int total_words = 0;
    int total_subwords = 0;
    tokenize_text_bpe(content, vocab, vi, &total_words, &total_subwords);

    int unique_bpe_tokens = count_unique_bpe_tokens(vocab);

    // Print performance summary
    print_statistics(vocab, total_words, total_subwords,
                     unique_bpe_tokens, num_merges,
                     time_taken, actual_threads, file_size);

    // Print sample tokenizations
    print_sample_tokenizations(vocab, vi);

    // Cleanup
    free(content);
    free_vocab_index(vi);
    free_vocab(vocab);

    printf("\nBPE Tokenization completed successfully!\n");
    return 0;
}