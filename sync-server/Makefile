BINARY_NAME  := dietledger-sync
VERSION      ?= 0.1.0
DIST_DIR     := dist

.PHONY: build build-all clean tidy test run

build:
	go build -ldflags="-s -w" -o $(BINARY_NAME) .

build-all: clean
	@mkdir -p $(DIST_DIR)
	GOOS=linux   GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-linux-amd64 .
	GOOS=linux   GOARCH=arm64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-linux-arm64 .
	GOOS=darwin  GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-darwin-amd64 .
	GOOS=darwin  GOARCH=arm64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-darwin-arm64 .
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-windows-amd64.exe .
	GOOS=windows GOARCH=arm64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-windows-arm64.exe .
	@echo "Built all platforms in $(DIST_DIR)/"

docker:
	docker build -t dietledger-sync:$(VERSION) .
	docker tag dietledger-sync:$(VERSION) dietledger-sync:latest

tidy:
	go mod tidy

test:
	go test ./...

clean:
	rm -rf $(DIST_DIR) $(BINARY_NAME) $(BINARY_NAME).exe

run: build
	./$(BINARY_NAME)
