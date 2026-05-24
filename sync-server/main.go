package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

var version = "dev"

func main() {
	port := envOrDefault("PORT", "8080")
	dbPath := envOrDefault("DB_PATH", "./sync.db")
	maxBodyMB, _ := strconv.ParseInt(envOrDefault("MAX_BODY_MB", "10"), 10, 64)
	corsOrigin := envOrDefault("CORS_ORIGIN", "*")

	log.Printf("[DietLedger Sync] Version: %s", version)

	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer store.Close()

	if err := store.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Printf("Database initialized at %s", dbPath)

	if err := store.SeedCategories(); err != nil {
		log.Printf("Warning: failed to seed categories: %v", err)
	}

	server := NewServer(store, corsOrigin, maxBodyMB)

	srv := &http.Server{
		Addr:           ":" + port,
		Handler:        server.Routes(),
		ReadTimeout:    30 * time.Second,
		WriteTimeout:   120 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("DietLedger Sync Server starting on :%s", port)
		log.Printf("CORS origin: %s", corsOrigin)
		log.Printf("Max body size: %dMB", maxBodyMB)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-done
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
