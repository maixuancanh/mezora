import type {Migration} from './runner';
export const documents:Migration={version:4,name:'private-invoice-documents',sql:`
CREATE TABLE IF NOT EXISTS documents(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),source_hash text NOT NULL,mime text NOT NULL,name text NOT NULL,bytes bytea,body jsonb NOT NULL,expires_at bigint NOT NULL,UNIQUE(workspace_id,source_hash));
`};
