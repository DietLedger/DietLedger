package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var version = "dev"

func main() {
	port := envOrDefault("PORT", "8080")
	databaseURL := envOrDefault("DATABASE_URL", "")
	maxBodyMB, _ := strconv.ParseInt(envOrDefault("MAX_BODY_MB", "10"), 10, 64)
	corsOrigin := envOrDefault("CORS_ORIGIN", "*")
	jwtKeyPath := envOrDefault("JWT_SIGNING_KEY_PATH", "")

	mode := "serve"
	if len(os.Args) == 2 {
		mode = os.Args[1]
	}
	if len(os.Args) > 2 || (mode != "serve" && mode != "bootstrap" && mode != "migrate") {
		log.Fatal("Usage: dietledger-api [serve|bootstrap|migrate]")
	}
	if err := validateDatabaseURL(databaseURL); err != nil {
		log.Fatal(err)
	}
	if mode == "serve" {
		if err := validateDeploymentSecrets(databaseURL, os.Getenv("HMAC_SECRET")); err != nil {
			log.Fatal(err)
		}
	}

	log.Printf("[DietLedger] Version: %s", version)

	pgStore, err := NewPostgresStore(databaseURL)
	if err != nil {
		log.Fatal("Failed to connect to PostgreSQL")
	}
	store := Store(pgStore)
	defer store.Close()

	switch mode {
	case "bootstrap":
		if err := ProvisionDatabaseRoles(pgStore.DB(), os.Getenv("MIGRATION_DB_PASSWORD"), os.Getenv("API_DB_PASSWORD")); err != nil {
			log.Fatal("Database role provisioning failed; inspect private configuration and restore ownership before retrying")
		}
		log.Println("Database roles prepared; no credentials changed on existing roles")
		return
	case "migrate":
		if err := RunMigrations(pgStore.DB(), migrationFS, "migrations"); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		if err := GrantRuntimePrivileges(pgStore.DB()); err != nil {
			log.Fatal("Runtime privilege configuration failed")
		}
		log.Println("PostgreSQL migrations complete")
		return
	}
	if err := VerifyMigrations(pgStore.DB(), migrationFS, "migrations"); err != nil {
		log.Fatalf("Database not ready: %v", err)
	}
	if err := VerifyRuntimeRole(pgStore.DB()); err != nil {
		log.Fatal(err)
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
		log.Printf("Request body limits: ordinary 1 MiB, native bundle import 32 MiB, dataset upload 512 MiB (MAX_BODY_MB is retired)")
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

func validateDeploymentSecrets(databaseURL, hmacSecret string) error {
	if err := validateDatabaseURL(databaseURL); err != nil {
		return err
	}
	if !validDeploymentSecret(hmacSecret, 32) {
		return fmt.Errorf("HMAC_SECRET must be a persistent, non-placeholder secret of at least 32 characters")
	}
	return nil
}

func validateDatabaseURL(databaseURL string) error {
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required and must contain a strong PostgreSQL password")
	}

	parsedURL, err := url.Parse(databaseURL)
	if err != nil || (parsedURL.Scheme != "postgres" && parsedURL.Scheme != "postgresql") || parsedURL.Hostname() == "" || parsedURL.User == nil {
		return fmt.Errorf("DATABASE_URL must be a valid PostgreSQL URL with a username and password")
	}
	databasePassword, hasPassword := parsedURL.User.Password()
	if !hasPassword || !validDeploymentSecret(databasePassword, 16) {
		return fmt.Errorf("DATABASE_URL must contain a non-placeholder password of at least 16 characters")
	}
	return nil
}

func validDeploymentSecret(secret string, minimumLength int) bool {
	if len(secret) < minimumLength {
		return false
	}

	normalized := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, strings.ToLower(secret))
	for _, placeholder := range []string{"changeme", "replaceme", "replacewith", "placeholder", "yourpassword", "yoursecret"} {
		if strings.Contains(normalized, placeholder) {
			return false
		}
	}

	switch normalized {
	case "password", "passwordpasswordpasswordpassword", "postgres", "dietledger", "secret", "default", "admin", "test", "example", "development":
		return false
	}
	return true
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
