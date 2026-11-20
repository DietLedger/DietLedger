-- Deliberately do not restore retired credentials or reopen consumed claims.
-- A down migration signs users out; bootstrap receipts survive downgrade.
DROP TABLE auth_refresh_tokens;
DROP TABLE auth_sessions;
