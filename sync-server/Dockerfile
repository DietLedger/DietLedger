FROM golang:1.24-alpine AS builder

ARG BUILD_VERSION=dev
WORKDIR /app

ENV GOPROXY=https://proxy.golang.org,direct
ENV GONOSUMCHECK=*

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY *.go ./
COPY migrations/ ./migrations/
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=${BUILD_VERSION}" -o dietledger-api .

FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata wget
RUN adduser -D -s /bin/sh apiuser

COPY --from=builder /app/dietledger-api /usr/local/bin/
COPY --from=builder /app/migrations/ /app/migrations/

RUN mkdir -p /data && chown apiuser:apiuser /data
VOLUME ["/data"]

USER apiuser

ENV PORT=8080
ENV DB_DRIVER=postgres
ENV DATABASE_URL=""
ENV CORS_ORIGIN=*
ENV FDA_API_KEY=DEMO_KEY

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/api/health || exit 1

ENTRYPOINT ["dietledger-api"]
