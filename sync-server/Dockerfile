FROM golang:1.22-alpine AS builder

ARG BUILD_VERSION=dev
WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download || true

COPY *.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=${BUILD_VERSION}" -o dietledger-sync .

FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata
RUN adduser -D -s /bin/sh syncuser

COPY --from=builder /app/dietledger-sync /usr/local/bin/

RUN mkdir -p /data && chown syncuser:syncuser /data
VOLUME ["/data"]

USER syncuser

ENV PORT=8080
ENV DB_PATH=/data/sync.db
ENV CORS_ORIGIN=*
ENV MAX_BODY_MB=10

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/api/health || exit 1

ENTRYPOINT ["dietledger-sync"]
