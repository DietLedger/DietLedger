package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	ordinaryBodyBytes int64 = 1 << 20
	bundleBodyBytes   int64 = 32 << 20
	datasetBodyBytes  int64 = 512 << 20
	seedInflatedBytes int64 = 4 << 30
	seedJobTimeout          = 10 * time.Minute
)

// Admission is process-local, including direct API requests. Release only after
// the handler returns, so bodies retained by handlers count toward the budget.
var bufferedAdmissions = make(chan struct{}, 16)
var uploadAdmissions = make(chan struct{}, 2)

func isDatasetUpload(path string) bool {
	return strings.TrimSuffix(path, "/") == "/api/foods/seed/upload"
}

func requestBodyLimit(path string) int64 {
	switch {
	case isDatasetUpload(path):
		return datasetBodyBytes
	case strings.TrimSuffix(path, "/") == "/api/recipe-bundles/import":
		return bundleBodyBytes
	default:
		return ordinaryBodyBytes
	}
}

func resourceAdmission(next http.Handler) http.Handler {
	return resourceAdmissionWithBudget(next, requestBodyLimit)
}

func resourceAdmissionWithBudget(next http.Handler, budget func(string) int64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil || r.Body == http.NoBody {
			next.ServeHTTP(w, r)
			return
		}
		limit := budget(r.URL.Path)
		if r.ContentLength > limit {
			writeError(w, http.StatusRequestEntityTooLarge, "request body exceeds route limit")
			return
		}
		slots, duration := bufferedAdmissions, 30*time.Second
		if isDatasetUpload(r.URL.Path) {
			slots, duration = uploadAdmissions, seedJobTimeout
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			w.Header().Set("Retry-After", "1")
			writeError(w, http.StatusServiceUnavailable, "request capacity exceeded")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), duration)
		defer cancel()
		r = r.WithContext(ctx)
		// Override the server's ordinary read timeout only for admitted uploads.
		_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(duration))
		if isDatasetUpload(r.URL.Path) {
			_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(duration))
		}
		body := http.MaxBytesReader(w, r.Body, limit)
		defer body.Close()
		var dst io.Writer
		var file *os.File
		var buffer bytes.Buffer
		if isDatasetUpload(r.URL.Path) {
			var err error
			file, err = os.CreateTemp("", "dietledger-upload-*")
			if err != nil {
				writeError(w, 503, "upload staging unavailable")
				return
			}
			defer os.Remove(file.Name())
			defer file.Close()
			dst = file
		} else {
			dst = &buffer
		}
		// Read the ENTIRE bounded body before any decoder/handler can persist a
		// valid prefix. Content-Length is only an early rejection optimization.
		n, err := io.Copy(dst, contextReader{ctx: ctx, reader: body})
		if err != nil {
			var sizeError *http.MaxBytesError
			if errors.As(err, &sizeError) {
				writeError(w, 413, "request body exceeds route limit")
			} else {
				writeError(w, 400, "request body could not be read")
			}
			return
		}
		if file != nil {
			if _, err := file.Seek(0, io.SeekStart); err != nil {
				writeError(w, 503, "upload staging unavailable")
				return
			}
			r.Body = file
		} else {
			r.Body = io.NopCloser(bytes.NewReader(buffer.Bytes()))
		}
		r.ContentLength = n
		next.ServeHTTP(w, r)
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	})
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

// No API response is opted into shared caching, including errors and public
// share views whose visibility can change. This does not change React Query.
func sensitiveCacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}
