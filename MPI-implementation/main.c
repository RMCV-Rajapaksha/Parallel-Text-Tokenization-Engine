#include <mpi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>

#define MAX_TOKEN_LENGTH 100
#define MAX_SYMBOL_LEN 50
#define HASH_TABLE_SIZE 100003
#define MAX_PAIRS 10000

typedef struct WordNode {
    char *word;
    int frequency;
    struct WordNode *next;
} WordNode;

typedef struct {
    char **symbols;
    int num_symbols;
    int frequency;
} BPEWord;

typedef struct {
    BPEWord *words;
    int vocab_size;
} BPEVocab;

typedef struct {
    char left[MAX_SYMBOL_LEN];
    char right[MAX_SYMBOL_LEN];
    int frequency;
} BestPair;

static char *xstrdup(const char *src) {
    size_t len = strlen(src) + 1;
    char *copy = (char *)malloc(len);
    if (copy != NULL) {
        memcpy(copy, src, len);
    }
    return copy;
}

static unsigned int hash_function(const char *str, int table_size) {
    unsigned long hash = 5381;
    int c;
    while ((c = (unsigned char)*str++)) {
        hash = ((hash << 5) + hash) + c;
    }
    return (unsigned int)(hash % table_size);
}

static char *read_file_content(const char *filename, long *file_size) {
    FILE *file = fopen(filename, "rb");
    if (!file) return NULL;
    fseek(file, 0, SEEK_END);
    *file_size = ftell(file);
    fseek(file, 0, SEEK_SET);
    char *content = (char*)malloc((*file_size > 0 ? *file_size : 1) + 1);
    if (!content) { fclose(file); return NULL; }
    size_t r = fread(content, 1, *file_size, file);
    if ((long)r != *file_size) { free(content); fclose(file); return NULL; }
    content[*file_size] = '\0';
    fclose(file);
    return content;
}

// Build local hash table from a text chunk
static WordNode **build_local_buckets(const char *text, long len, int *unique_words) {
    WordNode **buckets = (WordNode **)calloc(HASH_TABLE_SIZE, sizeof(WordNode*));
    *unique_words = 0;
    long i = 0;
    while (i < len) {
        while (i < len && isspace((unsigned char)text[i])) i++;
        if (i >= len) break;
        char token[MAX_TOKEN_LENGTH];
        int t = 0;
        while (i < len && !isspace((unsigned char)text[i]) && t < MAX_TOKEN_LENGTH - 1) {
            token[t++] = text[i++];
        }
        if (t == 0) continue;
        token[t] = '\0';
        char word_eow[MAX_TOKEN_LENGTH + 4];
        snprintf(word_eow, sizeof(word_eow), "%s</w>", token);
        unsigned int idx = hash_function(word_eow, HASH_TABLE_SIZE);
        WordNode *cur = buckets[idx];
        int found = 0;
        while (cur) {
            if (strcmp(cur->word, word_eow) == 0) { cur->frequency++; found = 1; break; }
            cur = cur->next;
        }
        if (!found) {
            WordNode *n = (WordNode*)malloc(sizeof(WordNode));
            n->word = xstrdup(word_eow);
            n->frequency = 1;
            n->next = buckets[idx];
            buckets[idx] = n;
            (*unique_words)++;
        }
    }
    return buckets;
}

// Serialize local buckets into a contiguous buffer: [int freq][c-string]\0 ...
static void serialize_buckets(WordNode **buckets, char **out_buf, int *out_bytes) {
    long bytes = 0;
    for (int b = 0; b < HASH_TABLE_SIZE; b++) {
        WordNode *cur = buckets[b];
        while (cur) {
            bytes += sizeof(int) + strlen(cur->word) + 1;
            cur = cur->next;
        }
    }
    char *buf = (char*)malloc(bytes);
    char *p = buf;
    for (int b = 0; b < HASH_TABLE_SIZE; b++) {
        WordNode *cur = buckets[b];
        while (cur) {
            memcpy(p, &cur->frequency, sizeof(int)); p += sizeof(int);
            strcpy(p, cur->word); p += strlen(cur->word) + 1;
            cur = cur->next;
        }
    }
    *out_buf = buf;
    *out_bytes = (int)bytes;
}

// Merge received entries into the global buckets (rank 0)
static void merge_serialized_into_buckets(WordNode **global_buckets, char *buf, int bytes) {
    char *p = buf;
    char *end = buf + bytes;
    while (p < end) {
        int freq = 0;
        memcpy(&freq, p, sizeof(int)); p += sizeof(int);
        char *word = p; size_t wl = strlen(word); p += wl + 1;
        unsigned int idx = hash_function(word, HASH_TABLE_SIZE);
        WordNode *cur = global_buckets[idx];
        int found = 0;
        while (cur) {
            if (strcmp(cur->word, word) == 0) { cur->frequency += freq; found = 1; break; }
            cur = cur->next;
        }
        if (!found) {
            WordNode *n = (WordNode*)malloc(sizeof(WordNode));
            n->word = xstrdup(word);
            n->frequency = freq;
            n->next = global_buckets[idx];
            global_buckets[idx] = n;
        }
    }
}

// Convert global buckets to BPEVocab
static BPEVocab *buckets_to_vocab(WordNode **buckets) {
    int unique = 0;
    for (int b = 0; b < HASH_TABLE_SIZE; b++) {
        WordNode *cur = buckets[b];
        while (cur) { unique++; cur = cur->next; }
    }
    BPEVocab *vocab = (BPEVocab*)malloc(sizeof(BPEVocab));
    vocab->words = (BPEWord*)malloc(unique * sizeof(BPEWord));
    vocab->vocab_size = 0;
    for (int b = 0; b < HASH_TABLE_SIZE; b++) {
        WordNode *cur = buckets[b];
        while (cur) {
            int vi = vocab->vocab_size;
            int len = (int)strlen(cur->word);
            vocab->words[vi].symbols = (char**)malloc(len * sizeof(char*));
            vocab->words[vi].num_symbols = 0;
            vocab->words[vi].frequency = cur->frequency;
            int pos = 0;
            while (pos < len) {
                if (pos + 3 < len && cur->word[pos] == '<' && cur->word[pos+1] == '/' && cur->word[pos+2] == 'w' && cur->word[pos+3] == '>') {
                    vocab->words[vi].symbols[vocab->words[vi].num_symbols++] = xstrdup("</w>");
                    pos += 4;
                } else {
                    char ch[2] = {cur->word[pos], '\0'};
                    vocab->words[vi].symbols[vocab->words[vi].num_symbols++] = xstrdup(ch);
                    pos++;
                }
            }
            vocab->vocab_size++;
            WordNode *tmp = cur; cur = cur->next; free(tmp->word); free(tmp);
        }
    }
    return vocab;
}

// Free buckets (used on non-root after serialization)
static void free_buckets(WordNode **buckets) {
    if (!buckets) return;
    for (int b = 0; b < HASH_TABLE_SIZE; b++) {
        WordNode *cur = buckets[b];
        while (cur) {
            WordNode *tmp = cur; cur = cur->next; free(tmp->word); free(tmp);
        }
    }
    free(buckets);
}

// Find best pair (serial)
static BestPair find_best_pair(BPEVocab *vocab) {
    BestPair best = {"", "", 0};
    char left_pairs[MAX_PAIRS][MAX_SYMBOL_LEN];
    char right_pairs[MAX_PAIRS][MAX_SYMBOL_LEN];
    int pair_counts[MAX_PAIRS] = {0};
    int unique_pairs = 0;
    for (int i = 0; i < vocab->vocab_size; i++) {
        BPEWord *word = &vocab->words[i];
        for (int j = 0; j < word->num_symbols - 1; j++) {
            char *l = word->symbols[j]; char *r = word->symbols[j+1];
            int found = 0;
            for (int k = 0; k < unique_pairs; k++) {
                if (strcmp(left_pairs[k], l) == 0 && strcmp(right_pairs[k], r) == 0) {
                    pair_counts[k] += word->frequency; found = 1;
                    if (pair_counts[k] > best.frequency) { strcpy(best.left, l); strcpy(best.right, r); best.frequency = pair_counts[k]; }
                    break;
                }
            }
            if (!found && unique_pairs < MAX_PAIRS) {
                strcpy(left_pairs[unique_pairs], l); strcpy(right_pairs[unique_pairs], r); pair_counts[unique_pairs] = word->frequency;
                if (pair_counts[unique_pairs] > best.frequency) { strcpy(best.left, l); strcpy(best.right, r); best.frequency = pair_counts[unique_pairs]; }
                unique_pairs++;
            }
        }
    }
    return best;
}

static void merge_pair(BPEVocab *vocab, const char *left, const char *right) {
    for (int i = 0; i < vocab->vocab_size; i++) {
        BPEWord *word = &vocab->words[i];
        char **new_symbols = (char**)malloc(word->num_symbols * sizeof(char*));
        int new_count = 0;
        for (int j = 0; j < word->num_symbols; j++) {
            if (j < word->num_symbols - 1 && strcmp(word->symbols[j], left) == 0 && strcmp(word->symbols[j+1], right) == 0) {
                char merged[MAX_SYMBOL_LEN * 2]; strcpy(merged, left); strcat(merged, right);
                new_symbols[new_count++] = xstrdup(merged);
                j++;
            } else {
                new_symbols[new_count++] = xstrdup(word->symbols[j]);
            }
        }
        for (int j = 0; j < word->num_symbols; j++) {
            free(word->symbols[j]);
        }
        free(word->symbols);
        word->symbols = new_symbols; word->num_symbols = new_count;
    }
}

static void train_bpe(BPEVocab *vocab, int target_merges) {
    for (int i = 0; i < target_merges; i++) {
        BestPair best = find_best_pair(vocab);
        if (best.frequency == 0) break;
        merge_pair(vocab, best.left, best.right);
    }
}

// Build vocab index for lookup
typedef struct VocabIndexNode { char *key; int vocab_idx; struct VocabIndexNode *next; } VocabIndexNode;
typedef struct { VocabIndexNode **buckets; } VocabIndex;

static VocabIndex *build_vocab_index(BPEVocab *vocab) {
    VocabIndex *vi = (VocabIndex*)malloc(sizeof(VocabIndex));
    vi->buckets = (VocabIndexNode**)calloc(HASH_TABLE_SIZE, sizeof(VocabIndexNode*));
    for (int i = 0; i < vocab->vocab_size; i++) {
        char reconstructed[MAX_TOKEN_LENGTH * 2] = "";
        for (int j = 0; j < vocab->words[i].num_symbols; j++) strcat(reconstructed, vocab->words[i].symbols[j]);
        unsigned int h = hash_function(reconstructed, HASH_TABLE_SIZE);
        VocabIndexNode *n = (VocabIndexNode*)malloc(sizeof(VocabIndexNode));
        n->key = xstrdup(reconstructed); n->vocab_idx = i; n->next = vi->buckets[h]; vi->buckets[h] = n;
    }
    return vi;
}

static int vocab_index_lookup(VocabIndex *vi, const char *key) {
    unsigned int h = hash_function(key, HASH_TABLE_SIZE);
    VocabIndexNode *cur = vi->buckets[h]; while (cur) { if (strcmp(cur->key, key) == 0) return cur->vocab_idx; cur = cur->next; } return -1;
}

static void free_vocab(BPEVocab *vocab) {
    if (!vocab) return;
    for (int i = 0; i < vocab->vocab_size; i++) {
        for (int j = 0; j < vocab->words[i].num_symbols; j++) free(vocab->words[i].symbols[j]);
        free(vocab->words[i].symbols);
    }
    free(vocab->words); free(vocab);
}

static void free_vocab_index(VocabIndex *vi) {
    if (!vi) return;
    for (int i = 0; i < HASH_TABLE_SIZE; i++) {
        VocabIndexNode *cur = vi->buckets[i];
        while (cur) {
            VocabIndexNode *tmp = cur;
            cur = cur->next;
            free(tmp->key);
            free(tmp);
        }
    }
    free(vi->buckets);
    free(vi);
}

static void tokenize_text_bpe(const char *text, BPEVocab *vocab, VocabIndex *vi, int *total_words, int *total_subwords) {
    int i = 0; char token[MAX_TOKEN_LENGTH]; int t = 0; *total_words = 0; *total_subwords = 0;
    while (text[i] != '\0') {
        while (text[i] != '\0' && isspace((unsigned char)text[i])) i++;
        t = 0; while (text[i] != '\0' && !isspace((unsigned char)text[i]) && t < MAX_TOKEN_LENGTH - 1) token[t++] = text[i++];
        if (t > 0) { token[t] = '\0'; (*total_words)++; char word_eow[MAX_TOKEN_LENGTH + 4]; snprintf(word_eow, sizeof(word_eow), "%s</w>", token); int idx = vocab_index_lookup(vi, word_eow); if (idx >= 0) *total_subwords += vocab->words[idx].num_symbols; }
    }
}

int main(int argc, char *argv[]) {
    MPI_Init(&argc, &argv);
    int rank, size; MPI_Comm_rank(MPI_COMM_WORLD, &rank); MPI_Comm_size(MPI_COMM_WORLD, &size);
    if (argc < 2 || argc > 3) {
        if (rank == 0) printf("Usage: %s <input_file> [num_merges]\n", argv[0]);
        MPI_Finalize(); return 1;
    }
    const char *filename = argv[1];
    int num_merges = 50; if (argc == 3) num_merges = atoi(argv[2]);

    char *full_buf = NULL; long file_size = 0;
    int *counts = NULL; int *displs = NULL;

    if (rank == 0) {
        full_buf = read_file_content(filename, &file_size);
        if (!full_buf) { fprintf(stderr, "Error reading file %s\n", filename); MPI_Abort(MPI_COMM_WORLD, 1); }
        counts = (int*)malloc(size * sizeof(int)); displs = (int*)malloc(size * sizeof(int));
        long approx = file_size / size; long start = 0;
        for (int r = 0; r < size; r++) {
            long s = start;
            if (r < size - 1) {
                long e = s + approx;
                if (e >= file_size) e = file_size;
                // move e forward to next whitespace to avoid splitting words
                while (e < file_size && !isspace((unsigned char)full_buf[e])) e++;
                counts[r] = (int)(e - s);
                displs[r] = (int)s;
                start = e;
            } else {
                counts[r] = (int)(file_size - s);
                displs[r] = (int)s;
            }
        }
    }

    // broadcast counts to all ranks
    int my_count = 0; if (rank == 0) my_count = counts[0];
    MPI_Bcast(&file_size, 1, MPI_LONG, 0, MPI_COMM_WORLD);
    if (rank != 0) counts = (int*)malloc(size * sizeof(int));
    MPI_Bcast(counts, size, MPI_INT, 0, MPI_COMM_WORLD);
    if (rank != 0) {
        displs = (int*)malloc(size * sizeof(int));
    }
    MPI_Bcast(displs, size, MPI_INT, 0, MPI_COMM_WORLD);

    my_count = counts[rank];
    char *my_chunk = (char*)malloc(my_count + 1);
    MPI_Scatterv(full_buf, counts, displs, MPI_CHAR, my_chunk, my_count, MPI_CHAR, 0, MPI_COMM_WORLD);
    my_chunk[my_count] = '\0';

    // each rank builds its local buckets
    int local_unique = 0;
    WordNode **local_buckets = build_local_buckets(my_chunk, my_count, &local_unique);

    // serialize local buckets
    char *send_buf = NULL; int send_bytes = 0;
    serialize_buckets(local_buckets, &send_buf, &send_bytes);

    if (rank == 0) {
        // create global buckets and merge rank0's own data first
        WordNode **global_buckets = (WordNode**)calloc(HASH_TABLE_SIZE, sizeof(WordNode*));
        merge_serialized_into_buckets(global_buckets, send_buf, send_bytes);
        free(send_buf);

        // receive from other ranks
        for (int r = 1; r < size; r++) {
            int bytes = 0; MPI_Recv(&bytes, 1, MPI_INT, r, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
            if (bytes > 0) {
                char *buf = (char*)malloc(bytes);
                MPI_Recv(buf, bytes, MPI_CHAR, r, 1, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
                merge_serialized_into_buckets(global_buckets, buf, bytes);
                free(buf);
            }
        }

        // convert to vocab and train BPE serially
        BPEVocab *vocab = buckets_to_vocab(global_buckets);
        double t0 = MPI_Wtime();
        train_bpe(vocab, num_merges);
        double t1 = MPI_Wtime();
        VocabIndex *vi = build_vocab_index(vocab);
        int total_words = 0, total_subwords = 0;
        tokenize_text_bpe(full_buf, vocab, vi, &total_words, &total_subwords);
        printf("MPI BPE (master) -- File size: %ld bytes, Unique words: %d, Total words: %d, Total subwords: %d, Training time: %.3f s\n",
               file_size, vocab->vocab_size, total_words, total_subwords, t1 - t0);
        printf("Sample tokenization for 'the':\n");
        char sample[MAX_TOKEN_LENGTH+4]; snprintf(sample, sizeof(sample), "%s</w>", "the");
        int idx = vocab_index_lookup(vi, sample);
        if (idx >= 0) {
            for (int j = 0; j < vocab->words[idx].num_symbols; j++) printf("'%s' ", vocab->words[idx].symbols[j]);
            printf("\n");
        }
        free_vocab_index(vi);
        free_vocab(vocab);
        free(full_buf);
        free(counts); free(displs);
    } else {
        // send serialized buffer to rank 0
        MPI_Send(&send_bytes, 1, MPI_INT, 0, 0, MPI_COMM_WORLD);
        if (send_bytes > 0) MPI_Send(send_buf, send_bytes, MPI_CHAR, 0, 1, MPI_COMM_WORLD);
        free(send_buf);
        free(counts); free(displs);
    }

    free_buckets(local_buckets);
    free(my_chunk);

    MPI_Finalize();
    return 0;
}
