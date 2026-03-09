#include <stdio.h>
#include <stdlib.h>
#include <omp.h>

static int is_delimiter(char c) {
    return c == ' ' || c == '\n' || c == '\t' || c == '\r' || c == '\f' || c == '\v';
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

    long long total_tokens = 0;
    double start_time = omp_get_wtime();

    #pragma omp parallel for reduction(+:total_tokens) schedule(static)
    for (long i = 0; i < file_size; i++) {
        if (is_delimiter(content[i])) {
            continue;
        }

        if (i > 0 && !is_delimiter(content[i - 1])) {
            continue;
        }

        total_tokens++;
    }

    double end_time = omp_get_wtime();

    printf("OpenMP Token Counter\n");
    printf("================================\n");
    printf("Threads used: %d\n", requested_threads);
    printf("File size: %ld bytes\n", file_size);
    printf("Total tokens: %lld\n", total_tokens);
    printf("Processing time: %.6f seconds\n", end_time - start_time);

    free(content);
    return 0;
}