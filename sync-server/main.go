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
	dbDriver := envOrDefault("DB_DRIVER", "postgres")
	dbPath := envOrDefault("DB_PATH", "./sync.db")
	databaseURL := envOrDefault("DATABASE_URL", "")
	maxBodyMB, _ := strconv.ParseInt(envOrDefault("MAX_BODY_MB", "10"), 10, 64)
	corsOrigin := envOrDefault("CORS_ORIGIN", "*")
	jwtKeyPath := envOrDefault("JWT_SIGNING_KEY_PATH", "")

	log.Printf("[DietLedger] Version: %s", version)
	log.Printf("[DietLedger] DB driver: %s", dbDriver)

	var store Store

	switch dbDriver {
	case "sqlite":
		sqliteStore, err := NewSQLiteStore(dbPath)
		if err != nil {
			log.Fatalf("Failed to open SQLite database: %v", err)
		}
		store = sqliteStore
		defer store.Close()

		if err := sqliteStore.InitDB(); err != nil {
			log.Fatalf("Failed to initialize SQLite schema: %v", err)
		}
		log.Printf("SQLite database initialized at %s", dbPath)

		if err := sqliteStore.SeedCategories(); err != nil {
			log.Printf("Warning: failed to seed categories: %v", err)
		}

	case "postgres":
		if databaseURL == "" {
			log.Fatal("DATABASE_URL is required when DB_DRIVER=postgres")
		}
		pgStore, err := NewPostgresStore(databaseURL)
		if err != nil {
			log.Fatalf("Failed to connect to PostgreSQL: %v", err)
		}
		store = pgStore
		defer store.Close()

		log.Println("Running PostgreSQL migrations ...")
		if err := RunMigrations(pgStore.DB(), migrationFS, "migrations"); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		log.Println("PostgreSQL migrations complete")

		if err := pgStore.SeedCategories(); err != nil {
			log.Printf("Warning: failed to seed categories: %v", err)
		}

	default:
		log.Fatalf("Unknown DB_DRIVER: %s (use 'postgres' or 'sqlite')", dbDriver)
	}

	auth, err := NewAuthService(store, jwtKeyPath)
	if err != nil {
		log.Fatalf("Failed to initialize auth service: %v", err)
	}

	rateLimiter := NewRateLimiter()

	server := NewServer(store, auth, corsOrigin, maxBodyMB, rateLimiter)

	server.startSeedProcessor()

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
		log.Printf("DietLedger API Server starting on :%s", port)
		log.Printf("CORS origin: %s", corsOrigin)
		log.Printf("Max body size: %dMB", maxBodyMB)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-done
	log.Println("Shutting down ...")

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
