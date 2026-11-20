package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestSeedUploadStreamRejectsTrailingJSONAndWorkerOverload(t *testing.T) {
	for _, body := range []string{`[{"fdcId":1,"calories":2}] trailing`, `[{"fdcId":1,"calories":2}] {}`} {
		if err := streamUploadedFoods(context.Background(), strings.NewReader(body), func(FoodItem) error { return nil }); err == nil {
			t.Fatal("trailing upload data accepted")
		}
	}
	if !acquireSeedWorker() {
		t.Fatal("fixture worker busy")
	}
	defer releaseSeedWorker()
	w := httptest.NewRecorder()
	(&Server{}).foodSeedUploadHandler(w, httptest.NewRequest("POST", "/api/foods/seed/upload", strings.NewReader("ignored")))
	if w.Code != 503 {
		t.Fatalf("duplicate upload worker: %d", w.Code)
	}
}

type countedUploadBody struct{ reads int }

func (b *countedUploadBody) Read(p []byte) (int, error) { b.reads++; return 0, io.EOF }
func (b *countedUploadBody) Close() error               { return nil }

func TestSeedMultipartCancellationStopsBeforeReading(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	body := &countedUploadBody{}
	r := httptest.NewRequest("POST", "/api/foods/seed/upload", body).WithContext(ctx)
	r.Header.Set("Content-Type", "multipart/form-data; boundary=synthetic")
	w := httptest.NewRecorder()
	(&Server{}).foodSeedUploadHandler(w, r)
	if body.reads != 0 {
		t.Fatalf("canceled multipart consumed %d reads", body.reads)
	}
	if w.Code != 400 {
		t.Fatalf("canceled multipart status %d", w.Code)
	}
}

func TestSeedMultipartCleanupOnInvalidData(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	file, err := form.CreateFormFile("file", "food.json")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.WriteString(file, strings.Repeat(" ", 2<<20)+"invalid")
	form.Close()
	r := httptest.NewRequest("POST", "/api/foods/seed/upload", &body)
	r.Header.Set("Content-Type", form.FormDataContentType())
	w := httptest.NewRecorder()
	(&Server{}).foodSeedUploadHandler(w, r)
	if w.Code != 400 {
		t.Fatalf("invalid upload status %d", w.Code)
	}
	entries, _ := os.ReadDir(os.TempDir())
	if len(entries) != 0 {
		t.Fatalf("multipart temp files leaked: %d", len(entries))
	}
}

type seedJobRecordingStore struct {
	Store
	status  string
	batches []int
	count   int
}

func (s *seedJobRecordingStore) UpdateSeedJob(_ int, status string, count int, _ float64, _ string) error {
	s.status = status
	s.count = count
	return nil
}
func (s *seedJobRecordingStore) CreateFoodItems(items []FoodItem) (int, error) {
	s.batches = append(s.batches, len(items))
	return len(items), nil
}

type seedMetadataBlockingStore struct {
	Store
	started chan struct{}
}

func (s *seedMetadataBlockingStore) UpdateSeedJobContext(ctx context.Context, _ int, _ string, _ int, _ float64, _ string) error {
	close(s.started)
	<-ctx.Done()
	return ctx.Err()
}

func TestSeedJobDeadlineAlsoCancelsBlockedMetadata(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := &seedMetadataBlockingStore{started: make(chan struct{})}
	client := &http.Client{Transport: syntheticRoundTripper(func(*http.Request) (*http.Response, error) {
		t.Error("download started despite metadata cancellation")
		return nil, context.Canceled
	})}
	done := make(chan struct{})
	go func() { defer close(done); (&Server{store: store}).runSeedJob(ctx, client, 1, "foundation") }()
	<-store.started
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("canceled metadata retained seed job")
	}
}

func TestSeedJobStreamsBoundedBatches(t *testing.T) {
	var payload strings.Builder
	payload.WriteString(`{"FoundationFoods":[`)
	for i := 0; i < 1001; i++ {
		if i > 0 {
			payload.WriteByte(',')
		}
		row, _ := json.Marshal(USDAFood{FdcID: i + 1, FoodNutrients: []USDANutrient{{Number: "203", Amount: 2}}})
		payload.Write(row)
	}
	payload.WriteString(`]}`)
	archive := syntheticSeedZIP(t, payload.String())
	client := &http.Client{Transport: syntheticRoundTripper(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(archive))}, nil
	})}
	store := &seedJobRecordingStore{}
	(&Server{store: store}).runSeedJob(context.Background(), client, 1, "foundation")
	if store.status != "completed" || store.count != 1001 || fmt.Sprint(store.batches) != "[500 500 1]" {
		t.Fatalf("status %s count %d batches %v", store.status, store.count, store.batches)
	}
}

func TestSeedDownloadBudgetAndCleanup(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	for _, n := range []int64{128, 129} {
		client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, ContentLength: -1, Body: io.NopCloser(io.LimitReader(repeatByteReader{}, n))}, nil
		})}
		f, size, err := downloadSeedArchive(context.Background(), client, "https://fixtures.example/dataset.zip", 128)
		if n == 129 {
			if err == nil {
				f.Close()
				os.Remove(f.Name())
				t.Fatal("oversize download accepted")
			}
			continue
		}
		if err != nil || size != n {
			t.Fatalf("at cap: size %d err %v", size, err)
		}
		f.Close()
		os.Remove(f.Name())
	}
	files, _ := os.ReadDir(os.TempDir())
	if len(files) != 0 {
		t.Fatalf("failed download leaked temp files: %d", len(files))
	}
}

func TestSeedDownloadCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) {
		cancel()
		return nil, r.Context().Err()
	})}
	if f, _, err := downloadSeedArchive(ctx, client, "https://fixtures.example/dataset.zip", 128); err == nil {
		f.Close()
		os.Remove(f.Name())
		t.Fatal("canceled download accepted")
	}
}

func syntheticSeedZIP(t *testing.T, payload string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	f, err := z.Create("data.json")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.WriteString(f, payload)
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestSeedZIPInflationAndStreaming(t *testing.T) {
	payload := `{"FoundationFoods":[{"fdcId":1,"description":"Salt","foodNutrients":[{"number":"307","amount":3}]}]}`
	archive := syntheticSeedZIP(t, payload)
	for _, limit := range []int64{int64(len(payload) - 1), int64(len(payload))} {
		count := 0
		err := streamSeedZIP(context.Background(), bytes.NewReader(archive), int64(len(archive)), "foundation", limit, func(f FoodItem) error { count++; return nil })
		if limit < int64(len(payload)) {
			if err == nil || count != 0 {
				t.Fatalf("ZIP bomb admitted: count %d err %v", count, err)
			}
		} else if err != nil || count != 1 {
			t.Fatalf("valid archive count %d err %v", count, err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := streamSeedZIP(ctx, bytes.NewReader(archive), int64(len(archive)), "foundation", 1024, func(FoodItem) error { t.Fatal("canceled job emitted food"); return nil }); err == nil {
		t.Fatal("canceled ZIP accepted")
	}
}

func TestSeedWorkerAdmission(t *testing.T) {
	if !acquireSeedWorker() {
		t.Fatal("initial worker refused")
	}
	defer releaseSeedWorker()
	if acquireSeedWorker() {
		releaseSeedWorker()
		t.Fatal("concurrent worker admitted")
	}
}

func TestSeedStreamRequiresCompleteJSONAndPreservesFoods(t *testing.T) {
	payload := `{"FoundationFoods":[{"fdcId":1,"foodNutrients":[{"number":"203","amount":2}]},{"fdcId":2}]}`
	count := 0
	if err := streamFoodJSON(context.Background(), strings.NewReader(payload), "foundation", func(f FoodItem) error {
		count++
		if f.FdcID != 1 || f.Protein != 2 {
			t.Fatalf("food changed: %+v", f)
		}
		return nil
	}); err != nil || count != 1 {
		t.Fatalf("count %d err %v", count, err)
	}
	if err := streamFoodJSON(context.Background(), strings.NewReader(payload+" garbage"), "foundation", func(FoodItem) error { return nil }); err == nil {
		t.Fatal("trailing invalid bytes silently accepted")
	}
}
