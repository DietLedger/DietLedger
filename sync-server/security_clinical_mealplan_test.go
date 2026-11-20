package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// Exercise the real middleware/router/store over a loopback HTTP listener.
// Like testStore, these fixtures require an explicitly disposable PostgreSQL DB.
type clinicalSecurityHTTP struct {
	env      *testEnv
	server   *httptest.Server
	bobToken string
	bobID    string
}

func newClinicalSecurityHTTP(t *testing.T) *clinicalSecurityHTTP {
	t.Helper()
	env := newTestEnv(t)
	bob, err := env.auth.Register("bob-security@example.com", "Password123", "Bob")
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(env.server.Routes())
	t.Cleanup(server.Close)
	return &clinicalSecurityHTTP{env: env, server: server, bobToken: bob.AccessToken, bobID: bob.User.ID}
}

func (h *clinicalSecurityHTTP) request(t *testing.T, token, method, path string, body any) (int, []byte) {
	t.Helper()
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, h.server.URL+path, bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res.StatusCode, raw
}

func (h *clinicalSecurityHTTP) create(t *testing.T, token, path string, body any) string {
	t.Helper()
	status, raw := h.request(t, token, "POST", path, body)
	if status != 201 {
		t.Fatalf("create %s: %d %s", path, status, raw)
	}
	var res struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		t.Fatal(err)
	}
	if res.Data.ID == "" {
		t.Fatalf("missing ID: %s", raw)
	}
	return res.Data.ID
}

func (h *clinicalSecurityHTTP) snapshot(t *testing.T, tables ...string) []string {
	t.Helper()
	db := h.env.store.(*PostgresStore).db
	var out []string
	for _, table := range tables { // table names are test constants, never request input.
		var rows string
		if err := db.QueryRow(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]'::jsonb)::text FROM ` + table + ` t`).Scan(&rows); err != nil {
			t.Fatal(err)
		}
		out = append(out, rows)
	}
	return out
}

func (h *clinicalSecurityHTTP) denied(t *testing.T, method, path string, body any, tables ...string) {
	t.Helper()
	before := h.snapshot(t, tables...)
	status, raw := h.request(t, h.env.token, method, path, body)
	if status != 404 {
		t.Errorf("%s %s: got %d, want 404; body=%s", method, path, status, raw)
	}
	if strings.Contains(string(raw), "victim-secret") {
		t.Error("rejection disclosed victim clinical/content data")
	}
	if after := h.snapshot(t, tables...); !reflect.DeepEqual(before, after) {
		t.Errorf("%s %s changed stored graph on denied request", method, path)
	}
}

func TestSecurityMeasurementOwnership(t *testing.T) {
	h := newClinicalSecurityHTTP(t)
	alice := h.env.token
	profile := func(token, name string) string {
		return h.create(t, token, "/api/profiles", map[string]any{"name": name, "sex": "female", "activityLevel": "moderate"})
	}
	ap, ap2, bp := profile(alice, "Alice"), profile(alice, "Alice second"), profile(h.bobToken, "Bob")
	payload := map[string]any{"date": "2026-11-01", "weightKg": 72.5, "bloodSugar": 103.0, "bloodPressureSystolic": 124.0, "bloodPressureDiastolic": 81.0, "measurementContext": "fasting", "notes": "victim-secret"}
	weight := func(token, p string) string { return h.create(t, token, "/api/profiles/"+p+"/weight", payload) }
	aw, bw := weight(alice, ap), weight(h.bobToken, bp)
	for _, method := range []string{"GET", "POST"} {
		t.Run("foreign collection "+method, func(t *testing.T) { h.denied(t, method, "/api/profiles/"+bp+"/weight", payload, "weight_entries") })
	}
	for _, pair := range [][2]string{{ap, bw}, {bp, aw}, {ap2, aw}, {"missing", aw}, {ap, "missing"}} {
		for _, method := range []string{"PUT", "DELETE"} {
			t.Run(method+pair[0]+pair[1], func(t *testing.T) {
				h.denied(t, method, "/api/profiles/"+pair[0]+"/weight/"+pair[1], payload, "weight_entries")
			})
		}
	}
	for _, method := range []string{"GET", "POST"} {
		h.denied(t, method, "/api/profiles/missing/weight", payload, "weight_entries")
	}
	status, _ := h.request(t, "", "GET", "/api/profiles/"+bp+"/weight", nil)
	if status != 401 {
		t.Errorf("anonymous status=%d", status)
	}
	// An inconsistent legacy child user_id must not grant access to Bob's parent.
	db := h.env.store.(*PostgresStore).db
	_, err := db.Exec(`UPDATE weight_entries SET user_id=$1 WHERE id=$2`, h.env.userID, bw)
	if err != nil {
		t.Fatal(err)
	}
	h.denied(t, "PUT", "/api/profiles/"+bp+"/weight/"+bw, payload, "weight_entries")
	// Owner-positive date filtering and all clinical fields stay intact.
	status, raw := h.request(t, alice, "GET", "/api/profiles/"+ap+"/weight?from=2026-11-01&to=2026-11-01", nil)
	if status != 200 || !bytes.Contains(raw, []byte(`"bloodSugar":103`)) || !bytes.Contains(raw, []byte(`"bloodPressureDiastolic":81`)) {
		t.Fatalf("owner clinical read: %d %s", status, raw)
	}
	status, raw = h.request(t, alice, "PUT", "/api/profiles/"+ap+"/weight/"+aw, payload)
	if status != 200 {
		t.Fatalf("owner update: %d %s", status, raw)
	}
	status, raw = h.request(t, alice, "DELETE", "/api/profiles/"+ap+"/weight/"+aw, nil)
	if status != 200 {
		t.Fatalf("owner delete: %d %s", status, raw)
	}
}

func TestSecurityAllergenParentOwnership(t *testing.T) {
	h := newClinicalSecurityHTTP(t)
	alice := h.env.token
	profile := func(token, name string) string {
		return h.create(t, token, "/api/dietary-profiles", map[string]any{"name": name})
	}
	ap, ap2, bp := profile(alice, "Alice"), profile(alice, "Alice second"), profile(h.bobToken, "Bob")
	payload := map[string]any{"allergen": "milk", "severity": "avoid", "customKeywords": `["victim-secret"]`}
	ar := h.create(t, alice, "/api/dietary-profiles/"+ap+"/allergen-rules", payload)
	br := h.create(t, h.bobToken, "/api/dietary-profiles/"+bp+"/allergen-rules", payload)
	for _, p := range []string{bp, "missing"} {
		for _, method := range []string{"GET", "POST"} {
			h.denied(t, method, "/api/dietary-profiles/"+p+"/allergen-rules", payload, "allergen_rules")
		}
	}
	for _, pair := range [][2]string{{ap, br}, {bp, ar}, {ap2, ar}, {"missing", ar}, {ap, "missing"}} {
		for _, method := range []string{"PUT", "DELETE"} {
			h.denied(t, method, "/api/dietary-profiles/"+pair[0]+"/allergen-rules/"+pair[1], map[string]any{"severity": "caution"}, "allergen_rules")
		}
	}
	for _, method := range []string{"PUT", "DELETE"} {
		h.denied(t, method, "/api/allergen-rules/"+br, map[string]any{"severity": "caution"}, "allergen_rules")
	}
	// Legacy attacker-owned rule with a foreign parent remains inaccessible.
	_, err := h.env.store.(*PostgresStore).db.Exec(`UPDATE allergen_rules SET user_id=$1 WHERE id=$2`, h.env.userID, br)
	if err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"PUT", "DELETE"} {
		h.denied(t, method, "/api/allergen-rules/"+br, map[string]any{"severity": "caution"}, "allergen_rules")
	}
	status, raw := h.request(t, alice, "PUT", "/api/allergen-rules/"+ar, map[string]any{"severity": "caution"})
	if status != 200 || !bytes.Contains(raw, []byte(`"allergen":"milk"`)) {
		t.Fatalf("owner partial update: %d %s", status, raw)
	}
	status, raw = h.request(t, alice, "DELETE", "/api/dietary-profiles/"+ap+"/allergen-rules/"+ar, nil)
	if status != 200 {
		t.Fatalf("owner delete: %d %s", status, raw)
	}
	// Store creation is independently protected, not merely the HTTP precheck.
	before := h.snapshot(t, "allergen_rules")
	row, err := h.env.store.CreateAllergenRule(h.env.userID, bp, &CreateAllergenRuleRequest{Allergen: "eggs", Severity: "avoid"})
	if err == nil && row != nil {
		t.Error("store accepted foreign dietary parent")
	}
	if !reflect.DeepEqual(before, h.snapshot(t, "allergen_rules")) {
		t.Error("store changed foreign parent graph")
	}
}

func TestSecurityMealPlanChildrenOwnership(t *testing.T) {
	h := newClinicalSecurityHTTP(t)
	alice := h.env.token
	plan := func(token, week string) string {
		return h.create(t, token, "/api/meal-plans", map[string]any{"name": "Plan", "weekStart": week})
	}
	ap, ap2, bp := plan(alice, "2026-11-02"), plan(alice, "2026-11-09"), plan(h.bobToken, "2026-11-02")
	group := func(token, p string) string {
		return h.create(t, token, "/api/meal-plans/"+p+"/groups", map[string]any{"name": "victim-secret", "date": "2026-11-02", "slot": "evening"})
	}
	ag, ag2, bg := group(alice, ap), group(alice, ap2), group(h.bobToken, bp)
	payload := func(g string) map[string]any {
		return map[string]any{"date": "2026-11-02", "slot": "evening", "sourceType": "custom", "foodName": "victim-secret", "servings": 2, "calories": 415.0, "protein": 22.0, "sodium": 150.0, "groupId": g}
	}
	ae := h.create(t, alice, "/api/meal-plans/"+ap+"/entries", payload(ag))
	be := h.create(t, h.bobToken, "/api/meal-plans/"+bp+"/entries", payload(bg))
	tables := []string{"meal_plans", "day_plan_entries", "meal_groups"}
	for _, parent := range []string{bp, "missing"} {
		for _, sub := range []string{"entries", "groups"} {
			for _, method := range []string{"GET", "POST"} {
				h.denied(t, method, "/api/meal-plans/"+parent+"/"+sub, payload(bg), tables...)
			}
		}
	}
	for _, pair := range [][2]string{{ap, be}, {bp, ae}, {ap2, ae}, {ap, "missing"}, {"missing", ae}} {
		for _, method := range []string{"PUT", "DELETE"} {
			h.denied(t, method, "/api/meal-plans/"+pair[0]+"/entries/"+pair[1], map[string]any{"position": 4}, tables...)
		}
	}
	for _, method := range []string{"PUT", "DELETE"} {
		h.denied(t, method, "/api/entries/"+be, map[string]any{"position": 4}, tables...)
	}
	for _, g := range []string{bg, ag2, "missing"} {
		h.denied(t, "POST", "/api/meal-plans/"+ap+"/entries", payload(g), tables...)
		h.denied(t, "PUT", "/api/entries/"+ae, map[string]any{"groupId": g}, tables...)
		h.denied(t, "DELETE", "/api/meal-plans/"+ap+"/groups?id="+g, nil, tables...)
	}
	recipe := h.create(t, h.bobToken, "/api/recipes", map[string]any{"name": "victim-secret", "servings": 2, "servingName": "bowl"})
	for _, rid := range []string{recipe, "missing"} {
		body := map[string]any{"date": "2026-11-02", "slot": "evening", "sourceType": "recipe", "recipeId": rid, "servings": 1}
		h.denied(t, "POST", "/api/meal-plans/"+ap+"/entries", body, tables...)
		h.denied(t, "PUT", "/api/entries/"+ae, body, tables...)
	}
	// Existing partial PUT semantics keep all omitted snapshot and grouping fields.
	status, raw := h.request(t, alice, "PUT", "/api/entries/"+ae, map[string]any{"position": 7})
	if status != 200 || !bytes.Contains(raw, []byte(`"calories":415`)) || !bytes.Contains(raw, []byte(`"protein":22`)) || !bytes.Contains(raw, []byte(ag)) {
		t.Fatalf("owner partial update: %d %s", status, raw)
	}
	status, raw = h.request(t, alice, "PUT", "/api/meal-plans/"+ap+"/entries/"+ae, map[string]any{"groupId": nil})
	if status != 200 {
		t.Fatalf("owner ungroup: %d %s", status, raw)
	}
	status, raw = h.request(t, alice, "DELETE", "/api/meal-plans/"+ap+"/groups?id="+ag, nil)
	if status != 200 {
		t.Fatalf("owner group delete: %d %s", status, raw)
	}
	status, raw = h.request(t, alice, "DELETE", "/api/entries/"+ae, nil)
	if status != 200 {
		t.Fatalf("owner entry delete: %d %s", status, raw)
	}
}
