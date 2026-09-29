ALTER TABLE public.ftth_nodes
  ADD COLUMN distribution_ratio integer NOT NULL DEFAULT 1;

ALTER TABLE public.ftth_nodes
  ADD CONSTRAINT ftth_nodes_distribution_ratio_check
  CHECK (distribution_ratio IN (1, 2, 4, 8, 16, 32, 64));