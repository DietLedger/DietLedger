package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestResourceRouteBudgetsAreExact(t *testing.T) {
	for path, want := range map[string]int64{
		"/api/auth/login":                    1 << 20,
		"/api/recipe-bundles/import":         32 << 20,
		"/api/recipe-bundles/import-extra":   1 << 20,
		"/api/recipe-imports/batch/decision": 1 << 20,
		"/api/foods/seed/upload":             512 << 20,
		"/api/foods/seed/upload-extra":       1 << 20,
	} {
		if got := requestBodyLimit(path); got != want {
			t.Fatalf("%s: %d want %d", path, got, want)
		}
	}
}

func TestResourceAdmissionBeforeDecode(t *testing.T) {
	for _, path := range []string{"/api/auth/login", "/api/recipe-bundles/import", "/api/foods/seed/upload"} {
		for _, extra := range []int{0, 1} {
			for _, declared := range []int64{-1, 1} {
				t.Run(path+"/"+string(rune('0'+extra))+"/"+string(rune('1'+declared)), func(t *testing.T) {
					limit := int64(128)
					// Reader yields enough bytes without allocating the upload budget.
					r := httptest.NewRequest("POST", path, io.LimitReader(repeatByteReader{}, limit+int64(extra)))
					r.ContentLength = declared
					called := false
					h := resourceAdmissionWithBudget(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						called = true
						n, err := io.Copy(io.Discard, r.Body)
						if err != nil || n != limit {
							t.Errorf("admitted bytes %d, err %v", n, err)
						}
						w.WriteHeader(204)
					}), func(string) int64 { return limit })
					w := httptest.NewRecorder()
					h.ServeHTTP(w, r)
					if extra == 1 && (w.Code != 413 || called) {
						t.Fatalf("oversize: status %d handler=%v", w.Code, called)
					}
					if extra == 0 && (w.Code != 204 || !called) {
						t.Fatalf("at cap: status %d handler=%v", w.Code, called)
					}
				})
			}
		}
	}
}

type repeatByteReader struct{}

func (repeatByteReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = ' '
	}
	return len(p), nil
}

func TestResourceBudgetsDoNotDependOnLegacyMaxBodySetting(t *testing.T) {
	for _, legacy := range []int64{0, 10, 999} {
		server := NewServer(nil, nil, "", legacy, nil)
		if server.maxBodyBytes != ordinaryBodyBytes {
			t.Fatalf("legacy body config changed ordinary handler budget: %d", server.maxBodyBytes)
		}
	}
}

func TestResourceGlobalRoutesRejectBeforeHandler(t *testing.T) {
	handler := (&Server{}).Routes()
	for _, path := range []string{"/api/auth/login", "/api/recipe-bundles/import", "/api/foods/seed/upload"} {
		r := httptest.NewRequest("POST", path, strings.NewReader("{}"))
		r.ContentLength = requestBodyLimit(path) + 1
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 413 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: status %d cache %q", path, w.Code, w.Header().Get("Cache-Control"))
		}
	}
	r := httptest.NewRequest("POST", "/api/auth/login", io.MultiReader(strings.NewReader("{}"), io.LimitReader(repeatByteReader{}, ordinaryBodyBytes)))
	r.ContentLength = -1
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 413 {
		t.Fatalf("chunked/global auth admission: %d", w.Code)
	}
}

func TestResourceAdmissionCountsUnreadTrailingData(t *testing.T) {
	called := false
	h := resourceAdmission(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
	body := io.MultiReader(strings.NewReader(`{}`), io.LimitReader(repeatByteReader{}, ordinaryBodyBytes))
	r := httptest.NewRequest("POST", "/api/auth/login", body)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 413 || called {
		t.Fatalf("status %d called=%v", w.Code, called)
	}
}

func TestResourceUploadSpoolRemoved(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	var name string
	h := resourceAdmission(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f, ok := r.Body.(*os.File)
		if !ok {
			t.Fatalf("upload body should be spooled, not buffered in memory: %T", r.Body)
		}
		name = f.Name()
		b, _ := io.ReadAll(r.Body)
		if !bytes.Equal(b, []byte("upload")) {
			t.Fatal("body changed")
		}
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/foods/seed/upload", strings.NewReader("upload")))
	if _, err := os.Stat(name); !os.IsNotExist(err) {
		t.Fatalf("upload spool retained: %v", err)
	}
}

func TestSensitiveCacheControlAndHeaders(t *testing.T) {
	for _, path := range []string{"/api/auth/login", "/api/auth/refresh", "/api/secrets/key", "/api/recipes", "/api/share/public-token"} {
		w := httptest.NewRecorder()
		sensitiveCacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) })).ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: cache = %q", path, w.Header().Get("Cache-Control"))
		}
		for name, want := range map[string]string{"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer"} {
			if got := w.Header().Get(name); got != want {
				t.Fatalf("%s = %q want %q", name, got, want)
			}
		}
		if w.Header().Get("Strict-Transport-Security") != "" {
			t.Fatal("HTTP default must not enable HSTS")
		}
	}
}
