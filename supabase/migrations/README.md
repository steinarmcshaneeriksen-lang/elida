# Database migrations

Migrations are applied directly to the Supabase project. This directory keeps
a readable record of the security-relevant ones so the reasoning survives
outside the database.

Applied, newest first:

| Migration | What and why |
|---|---|
| `revoke_execute_on_trigger_function` | `update_updated_at` is a trigger function and has no meaning as an RPC. `get_user_company_ids` and `user_administers_company` deliberately remain executable — RLS policies call them as the querying role, and revoking EXECUTE turns "no rows visible" into "permission denied" on every tenant table. Both filter on `auth.uid()`, so anon always gets an empty result. |
| `fix_partial_unique_indexes_for_upsert` | The import upserts with `ON CONFLICT (company_id, source_system, source_id)`. Postgres cannot infer a *partial* unique index from that clause, so every upsert failed. Replaced with plain unique indexes; NULLs still never collide. |
| `fix_privilege_escalation_on_company_access` | **Critical.** `company_access_insert` checked only that `user_id` was the caller's own, never that they had any relationship to `company_id` — so any signed-in user could grant themselves owner access to any company and read its entire ledger. `company_access_update` had the same gap via a missing `WITH CHECK`. Both now require `user_administers_company(company_id)`. |
| `restore_anon_execute_on_get_user_company_ids` | Reverts part of the previous migration: revoking EXECUTE from anon broke unauthenticated reads by raising instead of returning zero rows. |
| `harden_security_definer_and_grants` | Pinned `search_path` on SECURITY DEFINER functions (a mutable search_path on `get_user_company_ids` would let a caller shadow `users` and defeat isolation everywhere). Revoked RPC access to the `handle_new_auth_user` trigger function. Dropped `companies_insert`, which had `WITH CHECK (true)`. |
| `add_private_person_flag_to_suppliers` | `is_possible_private_person` / `is_anonymised`, so employees registered as suppliers can be reviewed and anonymised. |
| `add_source_unique_indexes_for_import` | Identity columns for idempotent re-import, plus the `import_runs` table. |
