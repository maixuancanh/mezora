import type { Migration } from './runner';
export const businessOperations:Migration={version:2,name:'business-operations',sql:`
CREATE TABLE IF NOT EXISTS import_batches(id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), source_hash text NOT NULL, body jsonb NOT NULL, UNIQUE(workspace_id,source_hash));
CREATE TABLE IF NOT EXISTS recurring_templates(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),body jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS recurring_occurrences(template_id text NOT NULL REFERENCES recurring_templates(id),period_key text NOT NULL,bill_id text NOT NULL REFERENCES bills(id),PRIMARY KEY(template_id,period_key));
CREATE TABLE IF NOT EXISTS vendors(workspace_id text NOT NULL REFERENCES workspaces(id),vendor_key text NOT NULL,recipient text NOT NULL,version integer NOT NULL DEFAULT 1,PRIMARY KEY(workspace_id,vendor_key));
CREATE TABLE IF NOT EXISTS policy_settings(workspace_id text PRIMARY KEY REFERENCES workspaces(id),version integer NOT NULL DEFAULT 1,body jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS policy_acknowledgements(workspace_id text NOT NULL REFERENCES workspaces(id),bill_id text NOT NULL REFERENCES bills(id),terms_hash text NOT NULL,policy_version integer NOT NULL,decision_hash text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,bill_id));
CREATE TABLE IF NOT EXISTS statement_runs(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS period_closes(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),statement_id text NOT NULL REFERENCES statement_runs(id),version integer NOT NULL,body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
`};
