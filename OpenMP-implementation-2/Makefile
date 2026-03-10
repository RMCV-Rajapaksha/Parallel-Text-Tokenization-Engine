CC      = gcc
CFLAGS  = -O2 -fopenmp
TARGET  = openmp_tokenizer
SRC     = main.c

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC)

clean:
	rm -f $(TARGET)