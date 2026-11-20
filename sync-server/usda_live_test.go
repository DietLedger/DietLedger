package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"testing"
)

type syntheticRoundTripper func(*http.Request) (*http.Response, error)

func (f syntheticRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestUSDAErrorsNeverExposeCredentialURLOrBody(t *testing.T) {
	secret := "synthetic-provider-key"
	for _, mode := range []string{"transport", "response", "decode", "read"} {
		t.Run(mode, func(t *testing.T) {
			client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) {
				switch mode {
				case "transport":
					return nil, fmt.Errorf("failed request %s", r.URL.String())
				case "response":
					return &http.Response{StatusCode: 500, Body: io.NopCloser(strings.NewReader(r.URL.String()))}, nil
				case "decode":
					return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"foods":"` + secret + `"}`))}, nil
				default:
					return &http.Response{StatusCode: 200, Body: errorReadCloser{errors.New(r.URL.String())}}, nil
				}
			})}
			_, err := searchUSDALiveWithClient(context.Background(), client, "synthetic query", secret, 50)
			if err == nil {
				t.Fatal("expected failure")
			}
			var logs bytes.Buffer
			logger := log.New(&logs, "", 0)
			logger.Printf("USDA live search failed: %v", err)
			response := fmt.Sprintf(`{"error":%q}`, err.Error())
			for _, output := range []string{logs.String(), response} {
				for _, forbidden := range []string{secret, "api_key", "https://", "usda.gov"} {
					if strings.Contains(output, forbidden) {
						t.Fatalf("provider data escaped: %q", output)
					}
				}
			}
		})
	}
}

type errorReadCloser struct{ err error }

func (e errorReadCloser) Read([]byte) (int, error) { return 0, e.err }
func (e errorReadCloser) Close() error             { return nil }

func TestUSDASearchBoundAndCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) {
		if r.Context().Err() != nil {
			return nil, r.Context().Err()
		}
		body := io.MultiReader(strings.NewReader(`{"foods":[]}`), io.LimitReader(repeatByteReader{}, usdaResponseBytes))
		return &http.Response{StatusCode: 200, Body: io.NopCloser(body)}, nil
	})}
	if _, err := searchUSDALiveWithClient(ctx, client, "test", "synthetic", 50); err == nil {
		t.Fatal("canceled search succeeded")
	}
	if _, err := searchUSDALiveWithClient(context.Background(), client, "test", "synthetic", 50); err == nil {
		t.Fatal("oversize provider response succeeded")
	}
}
