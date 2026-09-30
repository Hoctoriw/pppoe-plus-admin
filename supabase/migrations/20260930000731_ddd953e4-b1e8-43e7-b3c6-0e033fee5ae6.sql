ALTER TABLE public.ftth_nodes
  ADD COLUMN IF NOT EXISTS slack_m numeric NOT NULL DEFAULT 0;

ALTER TABLE public.ftth_nodes
  DROP CONSTRAINT IF EXISTS ftth_nodes_slack_m_check;

ALTER TABLE public.ftth_nodes
  ADD CONSTRAINT ftth_nodes_slack_m_check CHECK (slack_m >= 0 AND slack_m <= 500);