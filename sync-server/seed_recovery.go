package main

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
)

const seedCleanupTimeout = 5 * time.Second
const seedCheckpointVersion = "dietledger-resource-v1"

var errSeedAttemptInactive = errors.New("seed attempt is no longer active")

func newSeedCheckpoint(deadline time.Time) string {
	return seedCheckpointVersion + "/" + uuid.NewString() + "/" + deadline.UTC().Format(time.RFC3339Nano)
}

func expiredSeedCheckpoint(checkpoint string, now time.Time) bool {
	parts := strings.Split(checkpoint, "/")
	if len(parts) != 3 || parts[0] != seedCheckpointVersion {
		return false
	}
	if _, err := uuid.Parse(parts[1]); err != nil {
		return false
	}
	deadline, err := time.Parse(time.RFC3339Nano, parts[2])
	return err == nil && !now.Before(deadline)
}

func (s *Server) claimSeedJob(ctx context.Context, id int) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(seedJobTimeout)
	}
	checkpoint := newSeedCheckpoint(deadline)
	if store, ok := s.store.(interface {
		ClaimSeedJobContext(context.Context, int, string) (bool, error)
	}); ok {
		claimed, err := store.ClaimSeedJobContext(ctx, id, checkpoint)
		if err != nil {
			return "", err
		}
		if !claimed {
			return "", errSeedAttemptInactive
		}
		return checkpoint, nil
	}
	// Store substitutes in unit tests retain their existing interface; the
	// authoritative PostgreSQL store always uses the guarded durable claim.
	return "", s.seedJobStatus(ctx, id, "running", 0, 0, "")
}

func (s *Server) finishSeedAttempt(ctx context.Context, id int, checkpoint, status string, count int, message string) error {
	if store, ok := s.store.(interface {
		FinishSeedJobContext(context.Context, int, string, string, int, string) error
	}); ok {
		return store.FinishSeedJobContext(ctx, id, checkpoint, status, count, message)
	}
	progress := 0.0
	if status == "completed" {
		progress = 100
	}
	return s.seedJobStatus(ctx, id, status, count, progress, message)
}

func (s *Server) finishSeedJob(id int, checkpoint, status string, count int, message string) error {
	// A canceled work/client context must never suppress normal terminal state.
	// Cleanup has its own finite budget and must not keep the worker forever.
	ctx, cancel := context.WithTimeout(context.Background(), seedCleanupTimeout)
	defer cancel()
	err := s.finishSeedAttempt(ctx, id, checkpoint, status, count, message)
	if err != nil {
		log.Printf("[Seed] Job %d: terminal status pending scoped expiry reconciliation", id)
	}
	return err
}

func (s *Server) reconcileSeedJobs(ctx context.Context, now time.Time) error {
	jobs, err := s.seedJobs(ctx)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if job.Checkpoint == nil || !expiredSeedCheckpoint(*job.Checkpoint, now) {
			continue
		}
		switch job.Status {
		case "running", "downloading", "extracting", "importing":
		default:
			continue
		}
		err := s.finishSeedAttempt(ctx, job.ID, *job.Checkpoint, "failed", job.RecordCount, "seed attempt expired or terminal status could not be recorded")
		if err != nil && !errors.Is(err, errSeedAttemptInactive) {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) ClaimSeedJobContext(ctx context.Context, id int, checkpoint string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE seed_jobs SET status='running', checkpoint=$2, started_at=NOW() WHERE id=$1 AND status='pending' AND COALESCE(checkpoint,'')=''`, id, checkpoint)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	return n == 1, err
}

func (s *PostgresStore) FinishSeedJobContext(ctx context.Context, id int, checkpoint, status string, count int, message string) error {
	if status != "failed" && status != "completed" {
		return errors.New("terminal seed status required")
	}
	progress := 0
	if status == "completed" {
		progress = 100
	}
	result, err := s.db.ExecContext(ctx, `UPDATE seed_jobs SET status=$3, record_count=$4, progress=$5, error=CASE WHEN $3='failed' THEN $6 ELSE error END, completed_at=NOW() WHERE id=$1 AND checkpoint=$2 AND status IN ('running','downloading','extracting','importing')`, id, checkpoint, status, count, progress, message)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return errSeedAttemptInactive
	}
	return nil
}
