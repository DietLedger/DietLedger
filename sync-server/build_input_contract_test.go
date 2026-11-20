package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Evaluate the ordered filepath.Match rules and parent-directory matches used
// by this context's current ignore file. No Docker daemon/image build is used.
// https://docs.docker.com/build/building/context/#dockerignore-files
func dockerContextIncludes(t *testing.T, file string) bool {
	t.Helper()
	contents, err := os.ReadFile("../.dockerignore")
	if err != nil {
		t.Fatal(err)
	}
	included := true
	for _, raw := range strings.Split(string(contents), "\n") {
		pattern := strings.TrimSpace(raw)
		if pattern == "" || strings.HasPrefix(pattern, "#") {
			continue
		}
		negated := strings.HasPrefix(pattern, "!")
		pattern = strings.TrimPrefix(pattern, "!")
		pattern = filepath.Clean(strings.Trim(pattern, "/"))
		for candidate := file; candidate != "."; candidate = filepath.Dir(candidate) {
			matches, err := filepath.Match(pattern, candidate)
			if err != nil {
				t.Fatalf("invalid Docker ignore pattern %q: %v", pattern, err)
			}
			if matches {
				included = negated
				break
			}
		}
	}
	return included
}

func TestDockerContextIncludesOnlyAPITransport(t *testing.T) {
	for _, path := range []string{"src/app/api/[...path]/route.ts", "src/lib/api-proxy.ts", "next.config.ts"} {
		if !dockerContextIncludes(t, path) {
			t.Errorf("required public API transport input excluded: %s", path)
		}
	}
	for _, path := range []string{"src/app/api/legacy/route.ts", "src/app/api/route.ts", "src/app/api/[...path]/debug.ts", "src/app/api/[...path]/debug/route.ts", ".env", "node_modules/private.js"} {
		if dockerContextIncludes(t, path) {
			t.Errorf("unrelated/private Docker input unexpectedly included: %s", path)
		}
	}
}
