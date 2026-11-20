package main

import (
	"database/sql"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
)

// ProvisionDatabaseRoles is an explicit fresh-install operation, never a server
// startup side effect. PostgreSQL bootstrap authority is not passed to the API.
func ProvisionDatabaseRoles(db *sql.DB, migrationPassword, apiPassword string) error {
	hexSecret := regexp.MustCompile(`^[a-f0-9]{64}$`)
	if !hexSecret.MatchString(migrationPassword) || !hexSecret.MatchString(apiPassword) || migrationPassword == apiPassword {
		return fmt.Errorf("independent generated migration/runtime passwords are required")
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`SELECT pg_advisory_xact_lock(725106192)`); err != nil {
		return err
	}
	var database string
	if err = tx.QueryRow(`SELECT current_database()`).Scan(&database); err != nil {
		return err
	}
	// Cluster-wide role names do not prove ownership of this database. Check
	// provenance before creating a role, granting rights or changing schema owner.
	// A deliberate ownerless restore AS the migrator retains this provenance even
	// before the newest migrations run. Legacy/mixed ownership is never repaired.
	var populated, migrationOwned, freshOwner bool
	if err = tx.QueryRow(`WITH app_schema AS (
 SELECT oid,nspowner FROM pg_namespace WHERE nspname='public'
), app_objects AS (
 SELECT relowner AS owner FROM pg_class WHERE relnamespace=(SELECT oid FROM app_schema)
 UNION ALL SELECT proowner FROM pg_proc WHERE pronamespace=(SELECT oid FROM app_schema)
 UNION ALL SELECT typowner FROM pg_type WHERE typnamespace=(SELECT oid FROM app_schema)
 UNION ALL SELECT extowner FROM pg_extension WHERE extnamespace=(SELECT oid FROM app_schema)
)
SELECT EXISTS(SELECT 1 FROM app_objects),
 COALESCE((SELECT nspowner=(SELECT oid FROM pg_roles WHERE rolname='dietledger_migrate') FROM app_schema),false)
 AND NOT EXISTS(SELECT 1 FROM app_objects WHERE owner IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname='dietledger_migrate')),
 COALESCE((SELECT pg_get_userbyid(nspowner) IN (current_user,'pg_database_owner','dietledger_migrate') FROM app_schema),false)
`).Scan(&populated, &migrationOwned, &freshOwner); err != nil {
		return fmt.Errorf("cannot verify database ownership before bootstrap")
	}
	if populated && !migrationOwned || !populated && !freshOwner {
		return fmt.Errorf("existing database ownership is not controlled; restore its offline backup into a fresh target as the migration role, never automatic adoption")
	}
	for _, role := range []struct{ name, password string }{{"dietledger_migrate", migrationPassword}, {"dietledger_api", apiPassword}} {
		var exists bool
		if err = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1)`, role.name).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			if populated {
				return fmt.Errorf("initialized database lacks expected roles; restore original role/state backup, not automatic adoption")
			}
			// Role identifiers are fixed; passwords are restricted hex, never SQL input.
			if _, err = tx.Exec(`CREATE ROLE ` + pgx.Identifier{role.name}.Sanitize() + ` LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '` + role.password + `'`); err != nil {
				return fmt.Errorf("create database role failed")
			}
		}
	}
	// Do not change passwords on retries or adopt an administrative role.
	var unsafe bool
	if err = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('dietledger_api','dietledger_migrate') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR NOT rolcanlogin)) OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('dietledger_api','dietledger_migrate'))`).Scan(&unsafe); err != nil {
		return err
	}
	if unsafe {
		return fmt.Errorf("existing database roles have unsafe authority; manual recovery required")
	}
	dbName := pgx.Identifier{database}.Sanitize()
	if _, err = tx.Exec(`REVOKE ALL ON DATABASE ` + dbName + ` FROM PUBLIC; GRANT CONNECT, CREATE ON DATABASE ` + dbName + ` TO dietledger_migrate; GRANT CONNECT ON DATABASE ` + dbName + ` TO dietledger_api; REVOKE ALL ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO dietledger_migrate; GRANT USAGE ON SCHEMA public TO dietledger_api`); err != nil {
		return fmt.Errorf("configure database authority failed")
	}
	return tx.Commit()
}

// GrantRuntimePrivileges runs under the schema owner after controlled migrations.
// Public function execution is needed by existing triggers; no role/schema DDL
// privilege is granted to the API. The ledger is read-only to the API.
func GrantRuntimePrivileges(db *sql.DB) error {
	_, err := db.Exec(`
 GRANT USAGE ON SCHEMA public TO dietledger_api;
 GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO dietledger_api;
 GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dietledger_api;
 REVOKE ALL ON schema_migrations FROM dietledger_api;
 GRANT SELECT ON schema_migrations TO dietledger_api;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO dietledger_api;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO dietledger_api;
 `)
	return err
}

func VerifyRuntimeRole(db *sql.DB) error {
	var unsafe bool
	err := db.QueryRow(`SELECT
 EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=current_user)
 OR has_database_privilege(current_user,current_database(),'CREATE')
 OR has_schema_privilege(current_user,'public','CREATE')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_get_userbyid(c.relowner)=current_user)
 OR has_table_privilege(current_user,'public.schema_migrations','INSERT,UPDATE,DELETE,TRUNCATE')`).Scan(&unsafe)
	if err != nil {
		return fmt.Errorf("cannot verify runtime database authority")
	}
	if unsafe {
		return fmt.Errorf("API database role has administrative/schema authority; run controlled provisioning/migrations separately")
	}
	return nil
}
