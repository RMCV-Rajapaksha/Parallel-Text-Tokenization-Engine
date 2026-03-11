#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>

#define MAX_TOKEN_LENGTH 100
#define MAX_SYMBOL_LEN 50
#define HASH_TABLE_SIZE 100003  
#define MAX_LINE_LENGTH 10000

typedef struct BPEWord {
    char **symbols;
    int num_symbols;
    int frequency;
} BPEWord;    

typedef struct BPEVocab {
    BPEWord *words;
    int vocab_size;
} BPEVocab;   

typedef struct {
    char left[MAX_SYMBOL_LEN];
    char right[MAX_SYMBOL_LEN];
    int frequency;
} BestPair;


BestPair find_best_pair(BPEVocab *vocab) {
    BestPair best = {"", "", 0};
    
    // Arrays to manually track pair frequencies
    char left_pairs[10000][MAX_SYMBOL_LEN];
    char right_pairs[10000][MAX_SYMBOL_LEN];
    int pair_counts[10000] = {0};
    int unique_pairs = 0;

    // Iterate through every word in the vocabulary
    for (int i = 0; i < vocab->vocab_size; i++) {
        BPEWord word = vocab->words[i];
        
        // Look at adjacent symbols in the word
        for (int j = 0; j < word.num_symbols - 1; j++) {
            char *left_sym = word.symbols[j];
            char *right_sym = word.symbols[j+1];
            
            // Check if we've seen this pair before
            int found = 0;
            for (int k = 0; k < unique_pairs; k++) {
                if (strcmp(left_pairs[k], left_sym) == 0 && 
                    strcmp(right_pairs[k], right_sym) == 0) {
                    pair_counts[k] += word.frequency;
                    found = 1;
                    
                    // Update best pair if necessary
                    if (pair_counts[k] > best.frequency) {
                        strcpy(best.left, left_sym);
                        strcpy(best.right, right_sym);
                        best.frequency = pair_counts[k];
                    }
                    break;
                }
            }
            
            // Add new pair to our tracker
            if (!found && unique_pairs < 10000) {
                strcpy(left_pairs[unique_pairs], left_sym);
                strcpy(right_pairs[unique_pairs], right_sym);
                pair_counts[unique_pairs] = word.frequency;
                
                if (pair_counts[unique_pairs] > best.frequency) {
                    strcpy(best.left, left_sym);
                    strcpy(best.right, right_sym);
                    best.frequency = pair_counts[unique_pairs];
                }
                unique_pairs++;
            }
        }
    }
    return best;
}

void merge_pair(BPEVocab *vocab, const char *left, const char *right) {
    for (int i = 0; i < vocab->vocab_size; i++) {
        BPEWord *word = &vocab->words[i];
        
        // Allocate a temporary array to hold the new merged symbols
        char **new_symbols = malloc(word->num_symbols * sizeof(char*));
        int new_count = 0;
        
        for (int j = 0; j < word->num_symbols; j++) {
            // Check if the current and next symbol match our target pair
            if (j < word->num_symbols - 1 && 
                strcmp(word->symbols[j], left) == 0 && 
                strcmp(word->symbols[j+1], right) == 0) {
                
                // Create the newly merged symbol (e.g., "e" + "r" = "er")
                char merged[MAX_SYMBOL_LEN * 2];
                strcpy(merged, left);
                strcat(merged, right);
                
                new_symbols[new_count] = strdup(merged);
                new_count++;
                
                // Skip the next symbol since it was just merged
                j++; 
            } else {
                // Not a match, keep the current symbol as is
                new_symbols[new_count] = strdup(word->symbols[j]);
                new_count++;
            }
        }
        
        // Free the old symbols to prevent memory leaks
        for (int j = 0; j < word->num_symbols; j++) {
            free(word->symbols[j]);
        }
        free(word->symbols);
        
        // Assign the newly merged arrays back to the word
        word->symbols = new_symbols;
        word->num_symbols = new_count;
    }
}

void train_bpe(BPEVocab *vocab, int target_merges) {
    printf("Starting BPE Training for %d merges...\n", target_merges);
    
    for (int i = 0; i < target_merges; i++) {
        // Find the most frequent adjacent pair
        BestPair best = find_best_pair(vocab);
        
        // If frequency is 0, no more pairs exist to be merged
        if (best.frequency == 0) {
            printf("Training stopped: No more pairs to merge.\n");
            break;
        }
        
        printf("Merge %d: '%s' + '%s' (Frequency: %d)\n", 
               i + 1, best.left, best.right, best.frequency);
        
        // Execute the merge across the entire vocabulary
        merge_pair(vocab, best.left, best.right);
    }
    printf("BPE Training Complete.\n");
}

// Hash function
unsigned int hash_function(const char *str, int table_size) {
    unsigned long hash = 5381;
    int c;
    while ((c = *str++))
        hash = ((hash << 5) + hash) + c;
    return hash % table_size;
}

char* read_file_content(const char *filename, long *file_size) {
    FILE *file = fopen(filename, "r");
    if (file == NULL) {
        fprintf(stderr, "Error: Cannot open file %s\n", filename);
        return NULL;
    }
    
    fseek(file, 0, SEEK_END);
    *file_size = ftell(file);
    fseek(file, 0, SEEK_SET);
    
    char *content = (char*)malloc(*file_size + 1);
    if (content == NULL) {
        fprintf(stderr, "Error: Memory allocation failed\n");
        fclose(file);
        return NULL;
    }
    
    size_t bytes_read = fread(content, 1, *file_size, file);
    if (bytes_read != (size_t)*file_size) {
        fprintf(stderr, "Error: Failed to read complete file\n");
        free(content);
        fclose(file);
        return NULL;
    }
    
    content[*file_size] = '\0';
    fclose(file);
    return content;
}

// Build BPE vocabulary from text using hash table for word frequency counting
BPEVocab* build_vocab(const char *text) {
    // First pass: count unique words and their frequencies using a hash table
    typedef struct WordNode {
        char *word;
        int frequency;
        struct WordNode *next;
    } WordNode;

    WordNode **buckets = (WordNode**)calloc(HASH_TABLE_SIZE, sizeof(WordNode*));
    int unique_words = 0;

    char token[MAX_TOKEN_LENGTH];
    int token_index = 0;
    int i = 0;

    while (text[i] != '\0') {
        // Skip whitespace
        while (text[i] != '\0' && isspace(text[i])) i++;

        // Extract token
        token_index = 0;
        while (text[i] != '\0' && !isspace(text[i]) && token_index < MAX_TOKEN_LENGTH - 1) {
            token[token_index++] = text[i++];
        }

        if (token_index > 0) {
            token[token_index] = '\0';

            // Append end-of-word marker </w>
            char word_with_eow[MAX_TOKEN_LENGTH + 4];
            snprintf(word_with_eow, sizeof(word_with_eow), "%s</w>", token);

            unsigned int index = hash_function(word_with_eow, HASH_TABLE_SIZE);
            WordNode *current = buckets[index];
            int found = 0;

            while (current != NULL) {
                if (strcmp(current->word, word_with_eow) == 0) {
                    current->frequency++;
                    found = 1;
                    break;
                }
                current = current->next;
            }

            if (!found) {
                WordNode *new_node = (WordNode*)malloc(sizeof(WordNode));
                new_node->word = strdup(word_with_eow);
                new_node->frequency = 1;
                new_node->next = buckets[index];
                buckets[index] = new_node;
                unique_words++;
            }
        }
    }

    // Second pass: convert hash table into BPEVocab
    BPEVocab *vocab = (BPEVocab*)malloc(sizeof(BPEVocab));
    vocab->words = (BPEWord*)malloc(unique_words * sizeof(BPEWord));
    vocab->vocab_size = 0;

    for (int b = 0; b < HASH_TABLE_SIZE; b++) {
        WordNode *current = buckets[b];
        while (current != NULL) {
            int idx = vocab->vocab_size;
            int len = strlen(current->word);

            // Split word into individual character symbols
            vocab->words[idx].symbols = (char**)malloc(len * sizeof(char*));
            vocab->words[idx].num_symbols = 0;
            vocab->words[idx].frequency = current->frequency;

            int pos = 0;
            while (pos < len) {
                // Handle </w> as a single symbol
                if (pos + 3 < len && current->word[pos] == '<' && current->word[pos+1] == '/' 
                    && current->word[pos+2] == 'w' && current->word[pos+3] == '>') {
                    vocab->words[idx].symbols[vocab->words[idx].num_symbols] = strdup("</w>");
                    vocab->words[idx].num_symbols++;
                    pos += 4;
                } else {
                    char ch[2] = {current->word[pos], '\0'};
                    vocab->words[idx].symbols[vocab->words[idx].num_symbols] = strdup(ch);
                    vocab->words[idx].num_symbols++;
                    pos++;
                }
            }

            vocab->vocab_size++;
            WordNode *temp = current;
            current = current->next;
            free(temp->word);
            free(temp);
        }
    }
    free(buckets);

    return vocab;
}

// Build a lookup index
typedef struct VocabIndexNode {
    char *key;
    int vocab_idx;
    struct VocabIndexNode *next;
} VocabIndexNode;

typedef struct {
    VocabIndexNode **buckets;
} VocabIndex;

VocabIndex* build_vocab_index(BPEVocab *vocab) {
    VocabIndex *vi = (VocabIndex*)malloc(sizeof(VocabIndex));
    vi->buckets = (VocabIndexNode**)calloc(HASH_TABLE_SIZE, sizeof(VocabIndexNode*));

    for (int i = 0; i < vocab->vocab_size; i++) {
        char reconstructed[MAX_TOKEN_LENGTH * 2] = "";
        for (int j = 0; j < vocab->words[i].num_symbols; j++) {
            strcat(reconstructed, vocab->words[i].symbols[j]);
        }
        unsigned int h = hash_function(reconstructed, HASH_TABLE_SIZE);
        VocabIndexNode *node = (VocabIndexNode*)malloc(sizeof(VocabIndexNode));
        node->key = strdup(reconstructed);
        node->vocab_idx = i;
        node->next = vi->buckets[h];
        vi->buckets[h] = node;
    }
    return vi;
}

int vocab_index_lookup(VocabIndex *vi, const char *key) {
    unsigned int h = hash_function(key, HASH_TABLE_SIZE);
    VocabIndexNode *cur = vi->buckets[h];
    while (cur) {
        if (strcmp(cur->key, key) == 0) return cur->vocab_idx;
        cur = cur->next;
    }
    return -1;
}

void free_vocab_index(VocabIndex *vi) {
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

void tokenize_word_bpe(const char *word, BPEVocab *vocab, VocabIndex *vi) {
    char word_with_eow[MAX_TOKEN_LENGTH + 4];
    snprintf(word_with_eow, sizeof(word_with_eow), "%s</w>", word);

    int idx = vocab_index_lookup(vi, word_with_eow);
    if (idx >= 0) {
        printf("  '%s' -> [", word);
        for (int j = 0; j < vocab->words[idx].num_symbols; j++) {
            printf("'%s'", vocab->words[idx].symbols[j]);
            if (j < vocab->words[idx].num_symbols - 1) printf(", ");
        }
        printf("]\n");
    } else {
        printf("  '%s' -> [not found in vocab]\n", word);
    }
}

void tokenize_text_bpe(const char *text, BPEVocab *vocab, VocabIndex *vi, int *total_tokens, int *total_subwords) {
    char token[MAX_TOKEN_LENGTH];
    int token_index = 0;
    int i = 0;
    *total_tokens = 0;
    *total_subwords = 0;

    char word_with_eow[MAX_TOKEN_LENGTH + 4];

    while (text[i] != '\0') {
        while (text[i] != '\0' && isspace(text[i])) i++;

        token_index = 0;
        while (text[i] != '\0' && !isspace(text[i]) && token_index < MAX_TOKEN_LENGTH - 1) {
            token[token_index++] = text[i++];
        }

        if (token_index > 0) {
            token[token_index] = '\0';
            (*total_tokens)++;

            snprintf(word_with_eow, sizeof(word_with_eow), "%s</w>", token);

            int idx = vocab_index_lookup(vi, word_with_eow);
            if (idx >= 0) {
                *total_subwords += vocab->words[idx].num_symbols;
            }
        }
    }
}

int count_unique_bpe_tokens(BPEVocab *vocab) {
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

void free_vocab(BPEVocab *vocab) {
    for (int i = 0; i < vocab->vocab_size; i++) {
        for (int j = 0; j < vocab->words[i].num_symbols; j++) {
            free(vocab->words[i].symbols[j]);
        }
        free(vocab->words[i].symbols);
    }
    free(vocab->words);
    free(vocab);
}

// Print statistics
void print_statistics(BPEVocab *vocab, int total_words, int total_subwords, 
                      int unique_bpe_tokens, int num_merges, double time_taken) {
    printf("\n=== Serial BPE Tokenization Statistics ===\n");
    printf("Total words in text: %d\n", total_words);
    printf("Unique words in vocabulary: %d\n", vocab->vocab_size);
    printf("Number of BPE merges performed: %d\n", num_merges);
    printf("Unique BPE tokens (subword units): %d\n", unique_bpe_tokens);
    printf("Total subword tokens after BPE: %d\n", total_subwords);
    printf("Average subwords per word: %.2f\n", 
           total_words > 0 ? (double)total_subwords / total_words : 0.0);
    printf("Processing time: %.6f seconds\n", time_taken);
    printf("Throughput: %.2f words/second\n", 
           time_taken > 0 ? total_words / time_taken : 0.0);
}

int main(int argc, char *argv[]) {
    if (argc < 2 || argc > 3) {
        printf("Usage: %s <input_file> [num_merges]\n", argv[0]);
        printf("Example: %s ../ptbdataset/ptb.train.txt 50\n", argv[0]);
        return 1;
    }

    const char *filename = argv[1];
    int num_merges = 50; 
    if (argc == 3) {
        num_merges = atoi(argv[2]);
        if (num_merges <= 0) {
            fprintf(stderr, "Error: num_merges must be a positive integer\n");
            return 1;
        }
    }

    printf("Serial BPE Tokenization Engine\n");
    printf("================================\n");
    printf("Reading file: %s\n", filename);

    // Read file
    long file_size;
    char *content = read_file_content(filename, &file_size);
    if (content == NULL) {
        return 1;
    }
    printf("File size: %ld bytes\n", file_size);

    // Start timing
    clock_t start = clock();

    // Build vocabulary from text
    printf("Building vocabulary...\n");
    BPEVocab *vocab = build_vocab(content);
    printf("Vocabulary built: %d unique words\n", vocab->vocab_size);

    // Train BPE
    train_bpe(vocab, num_merges);

    // End timing
    clock_t end = clock();
    double time_taken = ((double)(end - start)) / CLOCKS_PER_SEC;

    // Build vocab index for fast lookup
    VocabIndex *vi = build_vocab_index(vocab);

    // Tokenize and count
    int total_words = 0;
    int total_subwords = 0;
    tokenize_text_bpe(content, vocab, vi, &total_words, &total_subwords);

    int unique_bpe_tokens = count_unique_bpe_tokens(vocab);

    // Print statistics
    print_statistics(vocab, total_words, total_subwords, unique_bpe_tokens, num_merges, time_taken);

    // Print sample tokenizations
    printf("\n=== Sample Tokenizations ===\n");
    const char *sample_words[] = {"the", "of", "and", "to", "in", "is", "that", "it"};
    int num_samples = 8;
    for (int i = 0; i < num_samples; i++) {
        tokenize_word_bpe(sample_words[i], vocab, vi);
    }

    // Clean up
    free(content);
    free_vocab_index(vi);
    free_vocab(vocab);

    printf("\nBPE Tokenization completed successfully!\n");
    return 0;
}
