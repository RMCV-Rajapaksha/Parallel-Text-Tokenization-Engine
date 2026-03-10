#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <omp.h>

#define MAX_TOKEN_LENGTH 100
#define HASH_TABLE_SIZE 100003

typedef struct TokenNode {
    char *token;
    int frequency;
    struct TokenNode *next;
} TokenNode;

typedef struct {
    TokenNode **buckets;
    int size;
    int unique_tokens;
    long long total_tokens;
} HashTable;

static int is_delimiter(char c) {
    return c == ' ' || c == '\n' || c == '\t' || c == '\r' || c == '\f' || c == '\v';
}

static unsigned int hash_function(const char *str, int table_size) {
    unsigned long hash = 5381;
    int c;
    while ((c = (unsigned char)*str++)) {
        hash = ((hash << 5) + hash) + c;
    }
    return (unsigned int)(hash % table_size);
}

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

static void insert_token(HashTable *ht, const char *token) {
    unsigned int index = hash_function(token, ht->size);
    TokenNode *current = ht->buckets[index];

    while (current != NULL) {
        if (strcmp(current->token, token) == 0) {
            current->frequency++;
            ht->total_tokens++;
            return;
        }
        current = current->next;
    }

    TokenNode *new_node = (TokenNode *)malloc(sizeof(TokenNode));
    if (!new_node) return;

    new_node->token = (char *)malloc(strlen(token) + 1);
    if (!new_node->token) {
        free(new_node);
        return;
    }

    strcpy(new_node->token, token);
    new_node->frequency = 1;
    new_node->next = ht->buckets[index];
    ht->buckets[index] = new_node;
    ht->unique_tokens++;
    ht->total_tokens++;
}

static void merge_hash_tables(HashTable *dest, HashTable *src) {
    for (int i = 0; i < src->size; i++) {
        TokenNode *current = src->buckets[i];
        while (current != NULL) {
            for (int k = 0; k < current->frequency; k++) {
                insert_token(dest, current->token);
            }
            current = current->next;
        }
    }
}

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

static char *read_file(const char *filename, long *file_size) {
    FILE *file = fopen(filename, "rb");
    if (file == NULL) {
        fprintf(stderr, "Error: Cannot open file %s\n", filename);
        return NULL;
    }

    fseek(file, 0, SEEK_END);
    *file_size = ftell(file);
    fseek(file, 0, SEEK_SET);

    char *content = (char *)malloc(*file_size + 1);
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

    long file_size = 0;
    char *content = read_file(filename, &file_size);
    if (content == NULL) {
        return 1;
    }

    omp_set_num_threads(requested_threads);

    HashTable **local_tables = (HashTable **)calloc(requested_threads, sizeof(HashTable *));
    if (!local_tables) {
        fprintf(stderr, "Error: Memory allocation failed for thread tables\n");
        free(content);
        return 1;
    }

    int actual_threads = 0;
    double start_time = omp_get_wtime();

    #pragma omp parallel
    {
        int tid = omp_get_thread_num();

        #pragma omp single
        {
            actual_threads = omp_get_num_threads();
        }

        HashTable *local_ht = create_hash_table(HASH_TABLE_SIZE);
        local_tables[tid] = local_ht;

        if (local_ht != NULL) {
            #pragma omp for schedule(static)
            for (long i = 0; i < file_size; i++) {
                if (is_delimiter(content[i])) {
                    continue;
                }

                if (i > 0 && !is_delimiter(content[i - 1])) {
                    continue;
                }

                char token[MAX_TOKEN_LENGTH];
                int token_index = 0;
                long j = i;

                while (j < file_size && !is_delimiter(content[j])) {
                    if (token_index < MAX_TOKEN_LENGTH - 1) {
                        token[token_index++] = content[j];
                    }
                    j++;
                }

                if (token_index > 0) {
                    token[token_index] = '\0';
                    insert_token(local_ht, token);
                }
            }
        }
    }

    HashTable *global_ht = create_hash_table(HASH_TABLE_SIZE);
    if (global_ht == NULL) {
        fprintf(stderr, "Error: Failed to create global hash table\n");
        for (int i = 0; i < actual_threads; i++) {
            free_hash_table(local_tables[i]);
        }
        free(local_tables);
        free(content);
        return 1;
    }

    for (int i = 0; i < actual_threads; i++) {
        if (local_tables[i] != NULL) {
            merge_hash_tables(global_ht, local_tables[i]);
            free_hash_table(local_tables[i]);
        }
    }

    double end_time = omp_get_wtime();

    printf("OpenMP Token Frequency Counter\n");
    printf("=========================================\n");
    printf("Threads used: %d\n", actual_threads);
    printf("Total tokens: %lld\n", global_ht->total_tokens);
    printf("Unique tokens: %d\n", global_ht->unique_tokens);
    printf("Processing time: %.6f seconds\n", end_time - start_time);

    free_hash_table(global_ht);
    free(local_tables);
    free(content);
    return 0;
}