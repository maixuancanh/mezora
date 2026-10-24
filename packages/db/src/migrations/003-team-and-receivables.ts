import type {Migration} from './runner';
export const teamAndReceivables:Migration={version:3,name:'team-and-receivables',sql:`
CREATE TABLE IF NOT EXISTS workspace_members(workspace_id text NOT NULL REFERENCES workspaces(id),address text NOT NULL,role text NOT NULL CHECK(role IN ('owner','requester','reviewer','viewer')),PRIMARY KEY(workspace_id,address));
CREATE TABLE IF NOT EXISTS workspace_invites(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),token_hash text NOT NULL UNIQUE,role text NOT NULL,expires_at bigint NOT NULL,used boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS team_settings(workspace_id text PRIMARY KEY REFERENCES workspaces(id),version integer NOT NULL DEFAULT 1,body jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS approval_requests(workspace_id text NOT NULL REFERENCES workspaces(id),bill_id text NOT NULL REFERENCES bills(id),terms_hash text NOT NULL,bill_version integer NOT NULL,requester text NOT NULL,settings_version integer NOT NULL DEFAULT 0,required integer NOT NULL,PRIMARY KEY(workspace_id,bill_id));
CREATE TABLE IF NOT EXISTS approval_votes(workspace_id text NOT NULL,bill_id text NOT NULL,address text NOT NULL,terms_hash text NOT NULL,bill_version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,bill_id,address));
CREATE TABLE IF NOT EXISTS receivables(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),share_hash text UNIQUE,body jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS receivable_transfers(chain_id integer NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,treasury text NOT NULL,amount numeric(78,0) NOT NULL,block_number text NOT NULL,block_hash text NOT NULL,PRIMARY KEY(chain_id,tx_hash,log_index));
CREATE TABLE IF NOT EXISTS receivable_allocations(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),receivable_id text NOT NULL REFERENCES receivables(id),chain_id integer NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,amount numeric(78,0) NOT NULL,UNIQUE(receivable_id,chain_id,tx_hash,log_index));
`};
