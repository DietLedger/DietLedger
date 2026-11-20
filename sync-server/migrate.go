package main

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

type Migration struct {
	Version int
	UpSQL   string
	DownSQL string
}

func RunMigrations(db *sql.DB, fs embed.FS, dir string) error {
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("create schema_migrations table: %w", err)
	}

	migrations, err := loadMigrations(fs, dir)
	if err != nil {
		return fmt.Errorf("load migrations: %w", err)
	}

	applied, err := getAppliedVersions(db)
	if err != nil {
		return fmt.Errorf("get applied versions: %w", err)
	}
	if err := validateAppliedMigrationVersions(migrations, applied); err != nil {
		return err
	}

	for _, m := range migrations {
		if applied[m.Version] {
			continue
		}
		log.Printf("[Migrate] Applying %04d ...", m.Version)
		// A seed is not applied until its version is recorded. Keep both in
		// one transaction so an interrupted/failed version write cannot cause
		// duplicate random-ID data when the next startup retries the migration.
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin migration %04d: %w", m.Version, err)
		}
		if _, err := tx.Exec(m.UpSQL); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %04d: %w", m.Version, err)
		}
		if _, err := tx.Exec(
			"INSERT INTO schema_migrations (version) VALUES ($1)",
			m.Version,
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %04d: %w", m.Version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %04d: %w", m.Version, err)
		}
		log.Printf("[Migrate] Applied %04d", m.Version)
	}

	return nil
}

// VerifyMigrations never mutates the schema; the API must not serve against an
// incomplete database or mask an unavailable migration ledger.
func VerifyMigrations(db *sql.DB, fs embed.FS, dir string) error {
	migrations, err := loadMigrations(fs, dir)
	if err != nil {
		return fmt.Errorf("load migrations: %w", err)
	}
	applied, err := getAppliedVersions(db)
	if err != nil {
		return fmt.Errorf("read migration ledger: %w", err)
	}
	if err := validateAppliedMigrationVersions(migrations, applied); err != nil {
		return err
	}
	for _, m := range migrations {
		if !applied[m.Version] {
			return fmt.Errorf("migration %04d has not been applied", m.Version)
		}
	}
	return nil
}

// The controlled migration command and read-only startup gate share membership
// validation. Reject unknown versions before known migration SQL or later grants;
// a higher maximum alone cannot detect an unknown gap below it.
func validateAppliedMigrationVersions(migrations []Migration, applied map[int]bool) error {
	known := make(map[int]bool, len(migrations))
	for _, m := range migrations {
		known[m.Version] = true
	}
	for version := range applied {
		if !known[version] {
			return fmt.Errorf("database contains migration %04d unknown to this API; downgrades are not supported", version)
		}
	}
	return nil
}

func loadMigrations(fs embed.FS, dir string) ([]Migration, error) {
	entries, err := fs.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read dir %s: %w", dir, err)
	}

	byVersion := make(map[int]*Migration)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		parts := strings.SplitN(name, "_", 2)
		if len(parts) != 2 {
			continue
		}
		version, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		if _, ok := byVersion[version]; !ok {
			byVersion[version] = &Migration{Version: version}
		}
		data, err := fs.ReadFile(dir + "/" + name)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		if strings.HasSuffix(name, ".up.sql") {
			byVersion[version].UpSQL = string(data)
		} else if strings.HasSuffix(name, ".down.sql") {
			byVersion[version].DownSQL = string(data)
		}
	}

	var result []Migration
	for _, m := range byVersion {
		if m.UpSQL != "" {
			result = append(result, *m)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Version < result[j].Version
	})
	return result, nil
}

func getAppliedVersions(db *sql.DB) (map[int]bool, error) {
	rows, err := db.Query("SELECT version FROM schema_migrations")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	applied := make(map[int]bool)
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		applied[v] = true
	}
	return applied, rows.Err()
}
