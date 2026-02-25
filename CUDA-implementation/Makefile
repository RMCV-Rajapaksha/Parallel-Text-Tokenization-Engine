CC      = nvcc
CFLAGS  = -O2 -arch=sm_60
TARGET  = cuda_tokenizer
SRC     = main.cu

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC)

clean:
	rm -f $(TARGET)
