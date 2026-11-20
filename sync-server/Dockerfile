# Reviewed linux/amd64 upstream manifests, 2026-11-19; update with release scans.
FROM golang:1.27.4-alpine@sha256:ea30e25680a5470bac02b08bb0e0a735fb75bd0ab7d431b9b95ee0abef362586 AS builder
RUN test "$(go env GOVERSION)" = "go1.27.4"

ARG BUILD_VERSION=dev
WORKDIR /app

ENV GOPROXY=https://proxy.golang.org,direct
ENV GOTOOLCHAIN=local

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY *.go ./
COPY migrations/ ./migrations/
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=${BUILD_VERSION}" -o dietledger-api .

FROM alpine:3.23@sha256:644c1ad8fc45cc581ab1b5ea7ec1bebc9b037fd4801ad697ca124deb3f9c9332
ARG BUILD_VERSION=dev
LABEL org.opencontainers.image.version=${BUILD_VERSION}

# Same-branch zlib security update; retains the existing libz ABI and packages.
RUN apk add --no-cache --upgrade 'zlib>=1.4-r0' && \
    apk --no-cache add ca-certificates tzdata wget
RUN adduser -D -s /bin/sh apiuser

COPY --from=builder /app/dietledger-api /usr/local/bin/
COPY --from=builder /app/migrations/ /app/migrations/

USER apiuser

ENV PORT=8080
ENV DATABASE_URL=""
ENV CORS_ORIGIN=*

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/api/health || exit 1

ENTRYPOINT ["dietledger-api"]
