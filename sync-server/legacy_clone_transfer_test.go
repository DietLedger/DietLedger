package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// Explicit opt-in only. This test creates ONE new labelled PostgreSQL container
// with tmpfs data and loopback-only publishing; it never accepts an existing DB
// URL/container or reads an installation .env. All secrets/accounts are synthetic.
func TestOfflineLegacyCloneTransfer(t *testing.T) {
	if os.Getenv("RUN_LEGACY_CLONE_FIXTURE") != "1" {
		t.Skip("explicit disposable-container authorization required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	endpoint := os.Getenv("LEGACY_CLONE_DOCKER_ENDPOINT")
	if !strings.HasPrefix(endpoint, "unix:///") || strings.ContainsAny(endpoint, "\r\n") {
		t.Fatal("explicit local Unix Docker endpoint required")
	}
	random := func() string {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			t.Fatal("fixture randomness failed")
		}
		return hex.EncodeToString(b)
	}
	docker := func(input []byte, extraEnv []string, args ...string) ([]byte, error) {
		cmd := exec.CommandContext(ctx, "docker", append([]string{"--host", endpoint}, args...)...)
		cmd.Env = legacyFixtureEnvironment(extraEnv...)
		if input != nil {
			cmd.Stdin = bytes.NewReader(input)
		}
		var output, diagnostic bytes.Buffer
		cmd.Stdout = &output
		cmd.Stderr = &diagnostic
		err := cmd.Run() // Never print upstream diagnostics or secret-bearing data.
		return output.Bytes(), err
	}
	root := t.TempDir()
	bootstrapPassword, migrationPassword, runtimePassword, hmac, claim := random(), random(), random(), random(), random()
	state := []byte("POSTGRES_PASSWORD=" + bootstrapPassword + "\nMIGRATION_DB_PASSWORD=" + migrationPassword + "\nAPI_DB_PASSWORD=" + runtimePassword + "\nHMAC_SECRET=" + hmac + "\nSETUP_CLAIM_SECRET=" + claim + "\n")
	if err := os.WriteFile(filepath.Join(root, "private-state"), state, 0600); err != nil {
		t.Fatal("private fixture state write failed")
	}
	// Exercise explicit backup/restore, not automatic generation of replacement keys.
	if err := os.WriteFile(filepath.Join(root, "private-state.backup"), state, 0600); err != nil {
		t.Fatal("state backup failed")
	}
	backup, err := os.ReadFile(filepath.Join(root, "private-state.backup"))
	if err != nil {
		t.Fatal("state backup read failed")
	}
	if err = os.WriteFile(filepath.Join(root, "private-state.restored"), backup, 0600); err != nil {
		t.Fatal("state restore failed")
	}
	restored, err := os.ReadFile(filepath.Join(root, "private-state.restored"))
	if err != nil || !bytes.Equal(state, restored) {
		t.Fatal("five-value state restore was not byte-identical")
	}
	pgEnv := filepath.Join(root, "postgres.env")
	if err = os.WriteFile(pgEnv, []byte("POSTGRES_USER=dietledger_bootstrap\nPOSTGRES_DB=legacy_clone\nPOSTGRES_PASSWORD="+bootstrapPassword+"\n"), 0600); err != nil {
		t.Fatal("private fixture environment write failed")
	}
	name := "dietledger-legacy-clone-" + random()[:12]
	image := "postgres:17-alpine@sha256:e80acae3f1109e8e4533618b594918936f2858c63afc7204c4773148a673add8"
	output, err := docker(nil, nil, "create", "--name", name, "--label", "io.dietledger.fixture=legacy-clone-transfer", "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,noexec,size=512m", "--memory", "512m", "--cpus", "1", "--env-file", pgEnv, image, "-c", "shared_buffers=16MB", "-c", "max_connections=20")
	if err != nil {
		t.Fatal("new disposable PostgreSQL fixture creation failed")
	}
	container := strings.TrimSpace(string(output))
	if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(container) {
		t.Fatal("cannot identify the newly created fixture")
	}
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		cmd := exec.CommandContext(cleanupCtx, "docker", "--host", endpoint, "rm", "--force", container)
		cmd.Env = legacyFixtureEnvironment()
		if err := cmd.Run(); err != nil {
			t.Error("own fixture cleanup failed; operator must inspect the specifically labelled fixture")
		}
	})
	if _, err = docker(nil, nil, "start", container); err != nil {
		t.Fatal("own PostgreSQL fixture start failed")
	}
	binding, err := docker(nil, nil, "port", container, "5432/tcp")
	if err != nil || !regexp.MustCompile(`^127\.0\.0\.1:[0-9]+\s*$`).Match(binding) {
		t.Fatal("fixture is not exclusively loopback published")
	}
	host := strings.TrimSpace(string(binding))
	dsn := func(database, user, password string) string {
		u := url.URL{Scheme: "postgres", Host: host, Path: "/" + database, User: url.UserPassword(user, password), RawQuery: "sslmode=disable"}
		return u.String()
	}
	connect := func(raw string) *sql.DB {
		db, err := sql.Open("pgx", raw)
		if err != nil {
			t.Fatal("fixture connection construction failed")
		}
		t.Cleanup(func() { db.Close() })
		return db
	}
	legacy := connect(dsn("legacy_clone", "dietledger_bootstrap", bootstrapPassword))
	ready := false
	for i := 0; i < 120; i++ {
		if legacy.PingContext(ctx) == nil {
			ready = true
			break
		}
		time.Sleep(250 * time.Millisecond)
	}
	if !ready {
		t.Fatal("fixture PostgreSQL startup failed")
	}
	var pgVersion int
	if err = legacy.QueryRow(`SELECT current_setting('server_version_num')::int`).Scan(&pgVersion); err != nil || pgVersion < 170000 || pgVersion >= 180000 {
		t.Fatal("PostgreSQL 17 fixture required")
	}
	// Apply exactly the unchanged legacy migration prefix, with the same per-step
	// SQL/version transaction as production. Never call current CreateUser here.
	migrations, err := loadMigrations(migrationFS, "migrations")
	if err != nil {
		t.Fatal("migration fixture load failed")
	}
	if migrations[len(migrations)-1].Version < 36 {
		t.Fatal("run against the authoritative integrated auth migration source")
	}
	if _, err = legacy.Exec(`CREATE TABLE schema_migrations(version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); err != nil {
		t.Fatal("legacy ledger creation failed")
	}
	applied := 0
	for _, m := range migrations {
		if m.Version > 35 {
			continue
		}
		tx, e := legacy.Begin()
		if e != nil {
			t.Fatal("legacy migration begin failed")
		}
		if _, e = tx.Exec(m.UpSQL); e == nil {
			_, e = tx.Exec(`INSERT INTO schema_migrations(version) VALUES($1)`, m.Version)
		}
		if e != nil {
			tx.Rollback()
			t.Fatalf("legacy migration %d failed", m.Version)
		}
		if e = tx.Commit(); e != nil {
			t.Fatal("legacy migration commit failed")
		}
		applied++
	}
	if applied != 35 {
		t.Fatal("legacy migration prefix is incomplete")
	}
	userID, recipeID, bookID, chapterID, profileID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	password, oldKey, provider := random(), "dl_"+random(), []byte("synthetic-provider-"+random())
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal("legacy password fixture failed")
	}
	cipher, err := encryptSecret(provider, []byte(hmac)[:32])
	if err != nil {
		t.Fatal("legacy provider encryption failed")
	}
	insert := func(query string, args ...any) {
		if _, e := legacy.Exec(query, args...); e != nil {
			t.Fatal("legacy fixture seed failed")
		}
	}
	insert(`INSERT INTO users(id,email,display_name,password_hash,api_key,is_admin) VALUES($1,$2,$3,$4,$5,true)`, userID, "legacy-clone@example.test", "Legacy fixture", string(passwordHash), oldKey)
	insert(`INSERT INTO recipes(id,user_id,name,servings,instructions) VALUES($1,$2,'Legacy recipe',3,'Preserved source instructions')`, recipeID, userID)
	insert(`INSERT INTO ingredients(id,recipe_id,fdc_id,name,amount,unit,calories,sodium,protein) VALUES($1,$2,-1,'Legacy ingredient',12,'g',46,17,4)`, uuid.NewString(), recipeID)
	insert(`INSERT INTO recipe_books(id,user_id,title,description) VALUES($1,$2,'Legacy book','Preserved source book')`, bookID, userID)
	insert(`INSERT INTO chapters(id,book_id,title,position) VALUES($1,$2,'Legacy chapter',2)`, chapterID, bookID)
	insert(`INSERT INTO chapter_recipes(id,chapter_id,recipe_id,position) VALUES($1,$2,$3,4)`, uuid.NewString(), chapterID, recipeID)
	insert(`INSERT INTO book_pages(id,book_id,title,content,position) VALUES($1,$2,'Legacy page','Preserved source page',1)`, uuid.NewString(), bookID)
	insert(`INSERT INTO person_profiles(id,user_id,name,sex,height_cm,calorie_target) VALUES($1,$2,'Legacy profile','female',168,1850)`, profileID, userID)
	insert(`INSERT INTO weight_entries(id,user_id,profile_id,date,weight_kg,blood_sugar,blood_pressure_systolic,blood_pressure_diastolic) VALUES($1,$2,$3,'2020-01-02',68,94,118,76)`, uuid.NewString(), userID, profileID)
	insert(`INSERT INTO food_log_entries(id,user_id,profile_id,date,meal_slot,source_type,name,servings,calories,protein,sodium) VALUES($1,$2,$3,'2020-01-02','morning','manual','Legacy snapshot',1.5,231,19,165)`, uuid.NewString(), userID, profileID)
	insert(`INSERT INTO user_settings(id,user_id,settings_json) VALUES($1,$2,'{"unitSystem":"metric","onboardingComplete":true}')`, uuid.NewString(), userID)
	insert(`INSERT INTO user_secrets(id,user_id,key_name,encrypted_value) VALUES($1,$2,'fda-api-key',$3)`, uuid.NewString(), userID, cipher)
	insert(`INSERT INTO refresh_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,'2030-01-01')`, uuid.NewString(), userID, random())
	baseline := legacyFixtureSnapshot(t, legacy, false)
	binary := filepath.Join(root, "fixture-api")
	build := exec.CommandContext(ctx, "go", "build", "-o", binary, ".")
	build.Env = legacyFixtureEnvironment()
	if _, err = build.CombinedOutput(); err != nil {
		t.Fatal("private backend command build failed")
	}
	apiCommand := func(raw, mode string) bool {
		cmd := exec.CommandContext(ctx, binary, mode)
		cmd.Env = legacyFixtureEnvironment("DATABASE_URL="+raw, "MIGRATION_DB_PASSWORD="+migrationPassword, "API_DB_PASSWORD="+runtimePassword)
		_, e := cmd.CombinedOutput()
		return e == nil
	}
	assertRefusal := func(db *sql.DB, raw, stage string) {
		t.Helper()
		contentBefore := legacyFixtureSnapshot(t, db, false)
		catalogBefore := legacyFixtureAuthoritySnapshot(t, db)
		accepted := apiCommand(raw, "bootstrap")
		contentAfter := legacyFixtureSnapshot(t, db, false)
		catalogAfter := legacyFixtureAuthoritySnapshot(t, db)
		if accepted || !legacyFixtureEqual(contentBefore, contentAfter) || catalogBefore != catalogAfter {
			t.Fatalf("bootstrap must refuse %s without any content, credential, ownership, ACL or membership mutation", stage)
		}
	}
	assertRefusal(legacy, dsn("legacy_clone", "dietledger_bootstrap", bootstrapPassword), "legacy database without controlled roles")
	var roles int
	if err = legacy.QueryRow(`SELECT count(*) FROM pg_roles WHERE rolname IN ('dietledger_migrate','dietledger_api')`).Scan(&roles); err != nil || roles != 0 {
		t.Fatal("refused legacy bootstrap created roles")
	}
	if _, err = legacy.Exec(`CREATE DATABASE dietledger`); err != nil {
		t.Fatal("fresh controlled target allocation failed")
	}
	targetAdmin := connect(dsn("dietledger", "dietledger_bootstrap", bootstrapPassword))
	if !apiCommand(dsn("dietledger", "dietledger_bootstrap", bootstrapPassword), "bootstrap") {
		t.Fatal("fresh target bootstrap command failed")
	}
	rolesOnlyBefore := legacyFixtureAuthoritySnapshot(t, targetAdmin)
	if !apiCommand(dsn("dietledger", "dietledger_bootstrap", bootstrapPassword), "bootstrap") || rolesOnlyBefore != legacyFixtureAuthoritySnapshot(t, targetAdmin) {
		t.Fatal("controlled roles-only rerun failed or changed role credentials/authority")
	}
	assertRefusal(legacy, dsn("legacy_clone", "dietledger_bootstrap", bootstrapPassword), "legacy database with pre-existing safe controlled roles")
	var tables int
	if err = targetAdmin.QueryRow(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`).Scan(&tables); err != nil || tables != 0 {
		t.Fatal("bootstrap must not apply application migrations before legacy restore")
	}
	dump, err := docker(nil, []string{"PGPASSWORD=" + bootstrapPassword}, "exec", "--env", "PGPASSWORD", container, "pg_dump", "--host", "127.0.0.1", "--username", "dietledger_bootstrap", "--dbname", "legacy_clone", "--format=custom", "--no-owner", "--no-acl")
	if err != nil || len(dump) == 0 {
		t.Fatal("ownerless ACL-free legacy dump failed")
	}
	if _, err = docker(dump, []string{"PGPASSWORD=" + migrationPassword}, "exec", "--interactive", "--env", "PGPASSWORD", container, "pg_restore", "--host", "127.0.0.1", "--username", "dietledger_migrate", "--dbname", "dietledger", "--no-owner", "--no-acl", "--clean", "--if-exists", "--single-transaction", "--exit-on-error"); err != nil {
		t.Fatal("restore as migration owner failed")
	}
	if !legacyFixtureEqual(baseline, legacyFixtureSnapshot(t, targetAdmin, false)) {
		t.Fatal("pre-migration dump/restore was not byte-identical")
	}
	// A migration-owned schema/ledger does not authorize mixed legacy-owned
	// objects. Inject each fault only in this newly created controlled fixture.
	if _, err = targetAdmin.Exec(`ALTER TABLE recipes OWNER TO dietledger_bootstrap`); err != nil {
		t.Fatal("mixed table-owner fixture failed")
	}
	assertRefusal(targetAdmin, dsn("dietledger", "dietledger_bootstrap", bootstrapPassword), "migration-owned schema with legacy-owned table")
	if _, err = targetAdmin.Exec(`ALTER TABLE recipes OWNER TO dietledger_migrate`); err != nil {
		t.Fatal("fixture table owner restoration failed")
	}
	if _, err = targetAdmin.Exec(`CREATE FUNCTION public.foreign_clone_fixture() RETURNS int LANGUAGE SQL AS 'SELECT 1'`); err != nil {
		t.Fatal("mixed routine-owner fixture failed")
	}
	assertRefusal(targetAdmin, dsn("dietledger", "dietledger_bootstrap", bootstrapPassword), "migration-owned schema with legacy-owned routine")
	if _, err = targetAdmin.Exec(`DROP FUNCTION public.foreign_clone_fixture()`); err != nil {
		t.Fatal("fixture routine cleanup failed")
	}
	if _, err = targetAdmin.Exec(`CREATE TYPE public.foreign_clone_fixture AS ENUM ('fixture')`); err != nil {
		t.Fatal("mixed type-owner fixture failed")
	}
	assertRefusal(targetAdmin, dsn("dietledger", "dietledger_bootstrap", bootstrapPassword), "migration-owned schema with legacy-owned type")
	if _, err = targetAdmin.Exec(`DROP TYPE public.foreign_clone_fixture`); err != nil {
		t.Fatal("fixture type cleanup failed")
	}
	if !apiCommand(dsn("dietledger", "dietledger_bootstrap", bootstrapPassword), "bootstrap") {
		t.Fatal("deliberately restored migration-owned schema was rejected before current migrations")
	}
	if !legacyFixtureEqual(baseline, legacyFixtureSnapshot(t, targetAdmin, false)) {
		t.Fatal("controlled restored rerun changed application data")
	}
	if !apiCommand(dsn("dietledger", "dietledger_migrate", migrationPassword), "migrate") {
		t.Fatal("controlled migration command after restore failed")
	}
	migratedAuthority := legacyFixtureAuthoritySnapshot(t, targetAdmin)
	migratedContent := legacyFixtureSnapshot(t, targetAdmin, false)
	if !apiCommand(dsn("dietledger", "dietledger_bootstrap", bootstrapPassword), "bootstrap") || migratedAuthority != legacyFixtureAuthoritySnapshot(t, targetAdmin) || !legacyFixtureEqual(migratedContent, legacyFixtureSnapshot(t, targetAdmin, false)) {
		t.Fatal("controlled migrated rerun failed or changed content/credentials/authority")
	}
	runtime := connect(dsn("dietledger", "dietledger_api", runtimePassword))
	if err = VerifyMigrations(runtime, migrationFS, "migrations"); err != nil {
		t.Fatal("runtime migration readiness rejected restored target")
	}
	if err = VerifyRuntimeRole(runtime); err != nil {
		t.Fatal("runtime privilege verification rejected restored target")
	}
	// Synthetic future-ledger fault plus a genuinely executable missing known
	// canary. Without the guard, migration 34 reseeds the removed fixture row;
	// the CLI would additionally repair the deliberately revoked runtime grant.
	migrationDB := connect(dsn("dietledger", "dietledger_migrate", migrationPassword))
	var knownLedgerRow, canaryRow string
	if err = migrationDB.QueryRow(`DELETE FROM schema_migrations WHERE version=34 RETURNING to_jsonb(schema_migrations)::text`).Scan(&knownLedgerRow); err != nil {
		t.Fatal("missing known migration fixture failed")
	}
	if err = migrationDB.QueryRow(`DELETE FROM community_categories WHERE slug='breakfast' RETURNING to_jsonb(community_categories)::text`).Scan(&canaryRow); err != nil {
		t.Fatal("known migration canary fixture failed")
	}
	if _, err = migrationDB.Exec(`INSERT INTO schema_migrations(version) VALUES(999999); REVOKE SELECT ON recipes FROM dietledger_api`); err != nil {
		t.Fatal("future ledger/ACL fixture failed")
	}
	var canRead bool
	if err = migrationDB.QueryRow(`SELECT has_table_privilege('dietledger_api','public.recipes','SELECT')`).Scan(&canRead); err != nil || canRead {
		t.Fatal("runtime grant canary did not take effect")
	}
	futureContent := legacyFixtureSnapshot(t, targetAdmin, false)
	futureAuthority := legacyFixtureAuthoritySnapshot(t, targetAdmin)
	futureErr := RunMigrations(migrationDB, migrationFS, "migrations")
	if futureErr == nil || !strings.Contains(futureErr.Error(), "downgrades are not supported") || !legacyFixtureEqual(futureContent, legacyFixtureSnapshot(t, targetAdmin, false)) || futureAuthority != legacyFixtureAuthoritySnapshot(t, targetAdmin) {
		t.Fatal("migration engine must reject an unknown ledger before executing missing known steps or changing data/authority")
	}
	acceptedFuture := apiCommand(dsn("dietledger", "dietledger_migrate", migrationPassword), "migrate")
	if acceptedFuture || !legacyFixtureEqual(futureContent, legacyFixtureSnapshot(t, targetAdmin, false)) || futureAuthority != legacyFixtureAuthoritySnapshot(t, targetAdmin) {
		t.Fatal("controlled migrate must reject future ledger without applying known steps or runtime grants")
	}
	// Restore only the synthetic fault, exactly, then prove a current controlled
	// migration rerun remains idempotent. No real dataset cleanup is performed.
	if _, err = migrationDB.Exec(`DELETE FROM schema_migrations WHERE version=999999`); err != nil {
		t.Fatal("future ledger fixture cleanup failed")
	}
	if _, err = migrationDB.Exec(`INSERT INTO schema_migrations SELECT * FROM jsonb_populate_record(NULL::schema_migrations,$1::jsonb)`, knownLedgerRow); err != nil {
		t.Fatal("known ledger fixture restoration failed")
	}
	if _, err = migrationDB.Exec(`INSERT INTO community_categories SELECT * FROM jsonb_populate_record(NULL::community_categories,$1::jsonb)`, canaryRow); err != nil {
		t.Fatal("canary row restoration failed")
	}
	if _, err = migrationDB.Exec(`GRANT SELECT ON recipes TO dietledger_api`); err != nil {
		t.Fatal("runtime grant fixture restoration failed")
	}
	if !apiCommand(dsn("dietledger", "dietledger_migrate", migrationPassword), "migrate") || !legacyFixtureEqual(migratedContent, legacyFixtureSnapshot(t, targetAdmin, false)) || migratedAuthority != legacyFixtureAuthoritySnapshot(t, targetAdmin) {
		t.Fatal("current controlled migration rerun failed or was not idempotent")
	}
	normalizedBefore := legacyFixtureSnapshot(t, legacy, true)
	if !legacyFixtureEqual(normalizedBefore, legacyFixtureSnapshot(t, targetAdmin, true)) {
		t.Fatal("migration changed legacy content beyond intentional API-key retirement")
	}
	var retired bool
	if err = runtime.QueryRow(`SELECT api_key IS NULL FROM users WHERE id=$1`, userID).Scan(&retired); err != nil || !retired {
		t.Fatal("legacy user API key was not retired")
	}
	for _, table := range []string{"auth_sessions", "auth_refresh_tokens", "bootstrap_claim_consumptions"} {
		var n int
		if err = runtime.QueryRow(`SELECT count(*) FROM ` + pgx.Identifier{table}.Sanitize()).Scan(&n); err != nil || n != 0 {
			t.Fatal("unexpected new auth data before login")
		}
	}
	for _, query := range []string{`CREATE TABLE public.forbidden_legacy_clone(id int)`, `ALTER TABLE users ADD COLUMN forbidden_legacy_clone int`, `CREATE ROLE forbidden_legacy_clone`, `SET ROLE dietledger_migrate`} {
		if _, err = runtime.Exec(query); err == nil {
			t.Fatal("API runtime retained forbidden DDL/admin authority")
		}
	}
	t.Setenv("HMAC_SECRET", hmac)
	t.Setenv("AUTH_ALLOW_INSECURE_LOOPBACK", "true")
	t.Setenv("SETUP_CLAIM_SECRET", claim)
	store := &PostgresStore{db: runtime}
	auth, err := NewAuthService(store, "")
	if err != nil {
		t.Fatal("restored auth initialization failed")
	}
	ciphertext, err := store.GetSecret(userID, "fda-api-key")
	if err != nil || !bytes.Equal(cipher, ciphertext) {
		t.Fatal("provider ciphertext changed")
	}
	plaintext, err := decryptSecret(ciphertext, auth.SecretKey())
	if err != nil || !bytes.Equal(provider, plaintext) {
		t.Fatal("unchanged HMAC could not decrypt legacy provider secret")
	}
	handler := NewServer(store, auth, "http://localhost:3000", 10, nil).Routes()
	loginBody, _ := json.Marshal(map[string]string{"email": "legacy-clone@example.test", "password": password})
	request := httptest.NewRequest(http.MethodPost, "http://localhost:3000/api/auth/login", bytes.NewReader(loginBody))
	request.Header.Set("Origin", "http://localhost:3000")
	request.Header.Set("Content-Type", "application/json")
	request.RemoteAddr = "127.0.0.1:12345"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatal("legacy bcrypt account could not log in through the current HTTP handler")
	}
	var login AuthResponse
	if err = json.Unmarshal(response.Body.Bytes(), &login); err != nil || login.AccessToken == "" {
		t.Fatal("new login did not issue session access")
	}
	if _, err = auth.ValidateAccessToken(login.AccessToken); err != nil {
		t.Fatal("new session access rejected")
	}
	for _, authorization := range []string{"ApiKey " + oldKey, "Bearer " + oldKey} {
		r := httptest.NewRequest(http.MethodGet, "http://localhost:3000/api/recipes", nil)
		r.Header.Set("Authorization", authorization)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatal("legacy API-key authentication remained usable")
		}
	}
	r := httptest.NewRequest(http.MethodGet, "http://localhost:3000/api/recipes", nil)
	r.Header.Set("Authorization", "Bearer "+login.AccessToken)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatal("new session cannot read preserved recipes")
	}
	user, err := store.GetUserByID(userID)
	if err != nil || user.PasswordHash != string(passwordHash) || !user.IsAdmin {
		t.Fatal("account identity/bcrypt/admin role changed")
	}
	if !legacyFixtureEqual(baseline, legacyFixtureSnapshot(t, legacy, false)) {
		t.Fatal("source legacy clone was modified by target operations")
	}
	t.Log("PASS: refusal with/without existing roles and mixed owners preserves all content/authority; fresh/restored/migrated controlled reruns; ownerless restore; controlled migrate; unknown-ledger refusal before known canary/runtime grants; all baseline account/content digests; unchanged HMAC decrypt; bcrypt HTTP login; old-key denial; runtime DDL refusal; exact five-value state backup/restore")
}

func legacyFixtureEnvironment(extra ...string) []string {
	values := []string{}
	for _, pair := range os.Environ() {
		key, _, _ := strings.Cut(pair, "=")
		if strings.HasPrefix(key, "DOCKER_") || strings.HasPrefix(key, "PG") || strings.HasPrefix(key, "COMPOSE_") || key == "DATABASE_URL" || key == "TEST_DATABASE_URL" || key == "HMAC_SECRET" || key == "SETUP_CLAIM_SECRET" || key == "MIGRATION_DB_PASSWORD" || key == "API_DB_PASSWORD" {
			continue
		}
		values = append(values, pair)
	}
	return append(values, extra...)
}
func legacyFixtureSnapshot(t *testing.T, db *sql.DB, normalized bool) map[string][32]byte {
	t.Helper()
	rows, err := db.Query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)
	if err != nil {
		t.Fatal("snapshot inventory failed")
	}
	names := []string{}
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			t.Fatal("snapshot inventory scan failed")
		}
		names = append(names, name)
	}
	if err = rows.Err(); err != nil {
		t.Fatal("snapshot inventory incomplete")
	}
	rows.Close()
	result := map[string][32]byte{}
	for _, name := range names {
		if normalized && (name == "auth_sessions" || name == "auth_refresh_tokens" || name == "bootstrap_claim_consumptions") {
			continue
		}
		projection, filter := "to_jsonb(t)", ""
		if normalized && name == "users" {
			projection = "to_jsonb(t)-'api_key'"
		}
		if normalized && name == "schema_migrations" {
			filter = " WHERE version<=35"
		}
		query := `SELECT COALESCE(jsonb_agg(v ORDER BY v::text)::text,'[]') FROM (SELECT ` + projection + ` AS v FROM ` + pgx.Identifier{"public", name}.Sanitize() + ` t` + filter + `) snapshot`
		var text string
		if err = db.QueryRow(query).Scan(&text); err != nil {
			t.Fatal("snapshot table read failed")
		}
		result[name] = sha256.Sum256([]byte(text))
	}
	return result
}

// Hash persisted authority metadata as well as application rows. Password hashes
// remain in memory only; never include these snapshots in test diagnostics.
// Exclude observational vacuum/statistics fields, not ACL/ownership/credentials.
func legacyFixtureAuthoritySnapshot(t *testing.T, db *sql.DB) [32]byte {
	t.Helper()
	var text string
	err := db.QueryRow(`SELECT jsonb_build_object(
 'databases',(SELECT jsonb_agg(to_jsonb(d)-ARRAY['datfrozenxid','datminmxid'] ORDER BY oid) FROM pg_database d),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY oid) FROM pg_authid r),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m),
 'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY oid) FROM pg_namespace n),
 'relations',(SELECT jsonb_agg(to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relallfrozen','relfrozenxid','relminmxid'] ORDER BY oid) FROM pg_class c WHERE relnamespace='public'::regnamespace),
 'routines',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_proc p WHERE pronamespace='public'::regnamespace),
 'types',(SELECT jsonb_agg(to_jsonb(y) ORDER BY oid) FROM pg_type y WHERE typnamespace='public'::regnamespace),
 'extensions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY oid) FROM pg_extension e),
 'defaults',(SELECT jsonb_agg(to_jsonb(a) ORDER BY oid) FROM pg_default_acl a),
 'sequences',(SELECT jsonb_agg(to_jsonb(s) ORDER BY schemaname,sequencename) FROM pg_sequences s WHERE schemaname='public')
 )::text`).Scan(&text)
	if err != nil {
		t.Fatal("fixture authority snapshot failed")
	}
	return sha256.Sum256([]byte(text))
}

func legacyFixtureEqual(a, b map[string][32]byte) bool {
	if len(a) != len(b) {
		return false
	}
	for table, hash := range a {
		if b[table] != hash {
			return false
		}
	}
	return true
}
