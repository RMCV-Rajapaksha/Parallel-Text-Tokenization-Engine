#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>
#include <omp.h>

#define MAX_TOKEN_LENGTH 100
#define HASH_TABLE_SIZE 100003  // Prime number for better distribution
#define MAX_LINE_LENGTH 10000

// Token entry in hash table
typedef struct TokenNode {
    char *token;
    int frequency;
    struct TokenNode *next;
} TokenNode;

// Hash table structure
typedef struct {
    TokenNode **buckets;
    int size;
    int unique_tokens;
    int total_tokens;
} HashTable;

// Function prototypes
unsigned int hash_function(const char *str, int table_size);
HashTable* create_hash_table(int size);
void insert_token(HashTable *ht, const char *token);
void merge_hash_tables(HashTable *dest, HashTable *src);
void free_hash_table(HashTable *ht);
void print_statistics(HashTable *ht, double time_taken, int num_threads);
void tokenize_chunk(const char *text, long start, long end, HashTable *ht);
char* read_file(const char *filename, long *file_size);

// Hash function (djb2 algorithm)
unsigned int hash_function(const char *str, int table_size) {
    unsigned long hash = 5381;
    int c;
    while ((c = *str++))
        hash = ((hash << 5) + hash) + c; // hash * 33 + c
    return hash % table_size;
}

// Create hash table
HashTable* create_hash_table(int size) {
    HashTable *ht = (HashTable*)malloc(sizeof(HashTable));
    ht->buckets = (TokenNode**)calloc(size, sizeof(TokenNode*));
    ht->size = size;
    ht->unique_tokens = 0;
    ht->total_tokens = 0;
    return ht;
}

// Insert or update token in hash table
void insert_token(HashTable *ht, const char *token) {
    unsigned int index = hash_function(token, ht->size);
    TokenNode *current = ht->buckets[index];
    
    // Search for existing token
    while (current != NULL) {
        if (strcmp(current->token, token) == 0) {
            current->frequency++;
            ht->total_tokens++;
            return;
        }
        current = current->next;
    }
    
    // Token not found, create new node
    TokenNode *new_node = (TokenNode*)malloc(sizeof(TokenNode));
    new_node->token = (char*)malloc(strlen(token) + 1);
    strcpy(new_node->token, token);
    new_node->frequency = 1;
    new_node->next = ht->buckets[index];
    ht->buckets[index] = new_node;
    ht->unique_tokens++;
    ht->total_tokens++;
}

// Merge source hash table into destination hash table
void merge_hash_tables(HashTable *dest, HashTable *src) {
    for (int i = 0; i < src->size; i++) {
        TokenNode *current = src->buckets[i];
        while (current != NULL) {
            // Insert token with its frequency
            unsigned int index = hash_function(current->token, dest->size);
            TokenNode *dest_current = dest->buckets[index];
            
            // Search for existing token in destination
            int found = 0;
            while (dest_current != NULL) {
                if (strcmp(dest_current->token, current->token) == 0) {
                    dest_current->frequency += current->frequency;
                    dest->total_tokens += current->frequency;
                    found = 1;
                    break;
                }
                dest_current = dest_current->next;
            }
            
            // If not found, create new node
            if (!found) {
                TokenNode *new_node = (TokenNode*)malloc(sizeof(TokenNode));
                new_node->token = (char*)malloc(strlen(current->token) + 1);
                strcpy(new_node->token, current->token);
                new_node->frequency = current->frequency;
                new_node->next = dest->buckets[index];
                dest->buckets[index] = new_node;
                dest->unique_tokens++;
                dest->total_tokens += current->frequency;
            }
            
            current = current->next;
        }
    }
}

// Tokenize a chunk of text
void tokenize_chunk(const char *text, long start, long end, HashTable *ht) {
    char token[MAX_TOKEN_LENGTH];
    int token_index = 0;
    long i = start;
    
    // Skip partial token at start (move to next whitespace)
    if (start > 0) {
        while (i < end && !isspace(text[i])) {
            i++;
        }
    }
    
    while (i < end) {
        // Skip whitespace
        while (i < end && isspace(text[i])) {
            i++;
        }
        
        // Extract token
        token_index = 0;
        while (i < end && !isspace(text[i]) && token_index < MAX_TOKEN_LENGTH - 1) {
            token[token_index++] = text[i++];
        }
        
        // Add token to hash table if not empty
        if (token_index > 0) {
            token[token_index] = '\0';
            insert_token(ht, token);
        }
    }
}

// Read entire file into memory
char* read_file(const char *filename, long *file_size) {
    FILE *file = fopen(filename, "r");
    if (file == NULL) {
        fprintf(stderr, "Error: Cannot open file %s\n", filename);
        return NULL;
    }
    
    // Get file size
    fseek(file, 0, SEEK_END);
    *file_size = ftell(file);
    fseek(file, 0, SEEK_SET);
    
    // Allocate memory and read file
    char *content = (char*)malloc(*file_size + 1);
    if (content == NULL) {
        fprintf(stderr, "Error: Memory allocation failed\n");
        fclose(file);
        return NULL;
    }
    
    size_t bytes_read = fread(content, 1, *file_size, file);
    if (bytes_read != *file_size) {
        fprintf(stderr, "Error: Failed to read complete file\n");
        free(content);
        fclose(file);
        return NULL;
    }
    
    content[*file_size] = '\0';
    fclose(file);
    
    return content;
}

// Free hash table memory
void free_hash_table(HashTable *ht) {
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

// Print statistics
void print_statistics(HashTable *ht, double time_taken, int num_threads) {
    printf("\n=== OpenMP Parallel Tokenization Statistics ===\n");
    printf("Number of threads: %d\n", num_threads);
    printf("Total tokens: %d\n", ht->total_tokens);
    printf("Unique tokens: %d\n", ht->unique_tokens);
    printf("Processing time: %.6f seconds\n", time_taken);
    printf("Throughput: %.2f tokens/second\n", ht->total_tokens / time_taken);
    
    // Calculate hash table statistics
    int empty_buckets = 0;
    int max_chain = 0;
    for (int i = 0; i < ht->size; i++) {
        int chain_length = 0;
        TokenNode *current = ht->buckets[i];
        while (current != NULL) {
            chain_length++;
            current = current->next;
        }
        if (chain_length == 0) empty_buckets++;
        if (chain_length > max_chain) max_chain = chain_length;
    }
    printf("Hash table load factor: %.4f\n", (double)ht->unique_tokens / ht->size);
    printf("Max collision chain: %d\n", max_chain);
    printf("Empty buckets: %d (%.2f%%)\n", empty_buckets, 
           (double)empty_buckets / ht->size * 100);
}

int main(int argc, char *argv[]) {
    int num_threads = 4;  // Default number of threads
    
    if (argc < 2 || argc > 3) {
        printf("Usage: %s <input_file> [num_threads]\n", argv[0]);
        printf("Example: %s ../ptbdataset/ptb.train.txt 8\n", argv[0]);
        return 1;
    }
    
    const char *filename = argv[1];
    if (argc == 3) {
        num_threads = atoi(argv[2]);
        if (num_threads < 1) {
            fprintf(stderr, "Error: num_threads must be at least 1\n");
            return 1;
        }
    }
    
    omp_set_num_threads(num_threads);
    
    printf("OpenMP Parallel Text Tokenization Engine\n");
    printf("==========================================\n");
    printf("Reading file: %s\n", filename);
    printf("Using %d threads\n", num_threads);
    
    // Read file
    long file_size;
    char *content = read_file(filename, &file_size);
    if (content == NULL) {
        return 1;
    }
    printf("File size: %ld bytes\n", file_size);
    
    // Start timing
    double start_time = omp_get_wtime();
    
    // Create thread-local hash tables
    HashTable **thread_tables = (HashTable**)malloc(num_threads * sizeof(HashTable*));
    
    // Parallel tokenization
    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        int total_threads = omp_get_num_threads();
        
        // Create thread-local hash table
        thread_tables[tid] = create_hash_table(HASH_TABLE_SIZE);
        
        // Calculate chunk boundaries
        long chunk_size = file_size / total_threads;
        long start = tid * chunk_size;
        long end = (tid == total_threads - 1) ? file_size : (tid + 1) * chunk_size;
        
        // Tokenize chunk
        tokenize_chunk(content, start, end, thread_tables[tid]);
    }
    
    // Merge results into main hash table
    HashTable *main_ht = create_hash_table(HASH_TABLE_SIZE);
    for (int i = 0; i < num_threads; i++) {
        merge_hash_tables(main_ht, thread_tables[i]);
        free_hash_table(thread_tables[i]);
    }
    free(thread_tables);
    
    // End timing
    double end_time = omp_get_wtime();
    double time_taken = end_time - start_time;
    
    // Print statistics
    print_statistics(main_ht, time_taken, num_threads);
    
    // Clean up
    free(content);
    free_hash_table(main_ht);
    
    printf("\nTokenization completed successfully!\n");
    return 0;
}
