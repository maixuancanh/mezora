import type { Migration } from './runner';
export const cashPlanScenarios:Migration={version:5,name:'immutable-cash-plan-scenarios',sql:`
CREATE TABLE cash_plan_scenarios (
 id text PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(id),
 name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 snapshot jsonb NOT NULL
);
CREATE INDEX cash_plan_scenarios_workspace_created ON cash_plan_scenarios(workspace_id,created_at DESC,id);
CREATE FUNCTION mezora_reject_cash_plan_scenario_change() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Cash plan scenarios are immutable'; END;
$$;
CREATE TRIGGER cash_plan_scenarios_immutable BEFORE UPDATE OR DELETE ON cash_plan_scenarios
 FOR EACH ROW EXECUTE FUNCTION mezora_reject_cash_plan_scenario_change();
`};
