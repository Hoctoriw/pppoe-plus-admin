ALTER TABLE public.ftth_nodes
  ADD COLUMN IF NOT EXISTS splitter_type text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS splitter_tap integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS parent_leg text NOT NULL DEFAULT 'tap';

ALTER TABLE public.ftth_nodes
  ADD CONSTRAINT ftth_nodes_splitter_type_check CHECK (splitter_type IN ('balanced','unbalanced')),
  ADD CONSTRAINT ftth_nodes_splitter_tap_check CHECK (splitter_tap BETWEEN 5 AND 50),
  ADD CONSTRAINT ftth_nodes_parent_leg_check CHECK (parent_leg IN ('tap','pass'));