package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// Production PostgreSQL metadata operations share the work's deadline too;
// otherwise a locked seed_jobs row could hold the only worker indefinitely.
func (s *Server) seedJobStatus(ctx context.Context, id int, status string, count int, progress float64, message string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if store, ok := s.store.(interface {
		UpdateSeedJobContext(context.Context, int, string, int, float64, string) error
	}); ok {
		return store.UpdateSeedJobContext(ctx, id, status, count, progress, message)
	}
	return s.store.UpdateSeedJob(id, status, count, progress, message)
}

func (s *Server) seedJobs(ctx context.Context) ([]SeedJob, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if store, ok := s.store.(interface {
		ListSeedJobsContext(context.Context) ([]SeedJob, error)
	}); ok {
		return store.ListSeedJobsContext(ctx)
	}
	return s.store.ListSeedJobs()
}

func (s *Server) createSeedJob(ctx context.Context, dataType, releaseDate, fileName string) (*SeedJob, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if store, ok := s.store.(interface {
		CreateSeedJobContext(context.Context, string, string, string) (*SeedJob, error)
	}); ok {
		return store.CreateSeedJobContext(ctx, dataType, releaseDate, fileName)
	}
	return s.store.CreateSeedJob(dataType, releaseDate, fileName)
}

var seedWorker = make(chan struct{}, 1)

func acquireSeedWorker() bool {
	select {
	case seedWorker <- struct{}{}:
		return true
	default:
		return false
	}
}
func releaseSeedWorker() { <-seedWorker }

// The caller owns the successful file. Every unsuccessful path removes it.
func downloadSeedArchive(ctx context.Context, client *http.Client, url string, limit int64) (*os.File, int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, errors.New("invalid dataset request")
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, errors.New("dataset download unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("dataset download HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > limit {
		return nil, 0, errors.New("dataset compressed size limit exceeded")
	}
	file, err := os.CreateTemp("", "dietledger-seed-*")
	if err != nil {
		return nil, 0, errors.New("dataset staging unavailable")
	}
	n, err := io.Copy(file, io.LimitReader(contextReader{ctx: ctx, reader: resp.Body}, limit+1))
	if err != nil || n > limit || ctx.Err() != nil {
		file.Close()
		os.Remove(file.Name())
		return nil, 0, errors.New("dataset download interrupted or size limit exceeded")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		file.Close()
		os.Remove(file.Name())
		return nil, 0, err
	}
	return file, n, nil
}

func streamSeedZIP(ctx context.Context, data io.ReaderAt, size int64, dataType string, inflatedLimit int64, emit func(FoodItem) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	z, err := zip.NewReader(data, size)
	if err != nil {
		return errors.New("invalid dataset archive")
	}
	if len(z.File) > 1000 {
		return errors.New("dataset archive has too many entries")
	}
	var total uint64
	for _, f := range z.File {
		if f.UncompressedSize64 > uint64(inflatedLimit) || total > uint64(inflatedLimit)-f.UncompressedSize64 {
			return errors.New("dataset inflated size limit exceeded")
		}
		total += f.UncompressedSize64
	}
	for _, f := range z.File {
		if strings.HasSuffix(strings.ToLower(f.Name), ".json") {
			rc, err := f.Open()
			if err != nil {
				return errors.New("invalid dataset archive entry")
			}
			defer rc.Close()
			// ZIP validates declared entry size and CRC; the additional byte cap
			// also bounds malformed entries regardless of their metadata.
			return streamFoodJSON(ctx, io.LimitReader(rc, inflatedLimit+1), dataType, emit)
		}
	}
	return errors.New("no JSON file found in dataset archive")
}

// Decode one food at a time: do not inflate a multi-GiB dataset into a byte
// slice plus raw JSON plus a second full food array. Emit in original order.
func streamFoodJSON(ctx context.Context, reader io.Reader, dataType string, emit func(FoodItem) error) error {
	decoder := json.NewDecoder(contextReader{ctx: ctx, reader: reader})
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return errors.New("dataset JSON object expected")
	}
	topKey := datasetTopLevelKeys[dataType]
	found := false
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return errors.New("invalid dataset JSON")
		}
		key, ok := token.(string)
		if !ok {
			return errors.New("invalid dataset key")
		}
		if !found && (key == topKey || (topKey == "" && strings.Contains(strings.ToLower(key), "food"))) {
			found = true
			if err := streamFoodArray(ctx, decoder, func(uf USDAFood) error {
				food := convertUSDAFood(uf, dataType)
				if hasMeaningfulFoodNutrition(food) {
					return emit(food)
				}
				return nil
			}); err != nil {
				return err
			}
		} else {
			var discard json.RawMessage
			if err := decoder.Decode(&discard); err != nil {
				return errors.New("invalid dataset metadata")
			}
		}
	}
	if _, err := decoder.Token(); err != nil {
		return errors.New("invalid dataset JSON end")
	}
	if !found {
		return errors.New("food array not found in dataset")
	}
	var trailing interface{}
	if err := decoder.Decode(&trailing); err != io.EOF {
		return errors.New("trailing dataset JSON data")
	}
	return ctx.Err()
}

func streamUploadedFoods(ctx context.Context, reader io.Reader, emit func(FoodItem) error) error {
	decoder := json.NewDecoder(contextReader{ctx: ctx, reader: reader})
	token, err := decoder.Token()
	if err != nil || token != json.Delim('[') {
		return errors.New("food array expected")
	}
	for decoder.More() {
		if err := ctx.Err(); err != nil {
			return err
		}
		var food FoodItem
		if err := decoder.Decode(&food); err != nil {
			return errors.New("invalid uploaded food")
		}
		if hasMeaningfulFoodNutrition(food) {
			if err := emit(food); err != nil {
				return err
			}
		}
	}
	if _, err := decoder.Token(); err != nil {
		return errors.New("invalid food array end")
	}
	var trailing interface{}
	if err := decoder.Decode(&trailing); err != io.EOF {
		return errors.New("trailing upload data")
	}
	return ctx.Err()
}

func streamFoodArray(ctx context.Context, decoder *json.Decoder, emit func(USDAFood) error) error {
	token, err := decoder.Token()
	if err != nil || token != json.Delim('[') {
		return errors.New("food array expected")
	}
	for decoder.More() {
		if err := ctx.Err(); err != nil {
			return err
		}
		var food USDAFood
		if err := decoder.Decode(&food); err != nil {
			return errors.New("invalid dataset food")
		}
		if err := emit(food); err != nil {
			return err
		}
	}
	_, err = decoder.Token()
	return err
}
