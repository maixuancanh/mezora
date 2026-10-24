export const businessWorkbench = {
  version: 1,
  name: "business-workbench-foundation",
  sql: `
CREATE TABLE audit_events (
 id text PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(id),
 actor_id text NOT NULL,
 action text NOT NULL,
 entity_id text NOT NULL,
 entity_version integer CHECK(entity_version > 0),
 body jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_workspace_created ON audit_events(workspace_id,created_at,id);
CREATE FUNCTION mezora_reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
$$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
 FOR EACH ROW EXECUTE FUNCTION mezora_reject_audit_change();
CREATE TABLE mutation_idempotency (
 workspace_id text NOT NULL REFERENCES workspaces(id),
 action text NOT NULL,
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(workspace_id,action,idempotency_key),
 CHECK((completed_at IS NULL AND response IS NULL) OR (completed_at IS NOT NULL AND response IS NOT NULL))
);`,
};
