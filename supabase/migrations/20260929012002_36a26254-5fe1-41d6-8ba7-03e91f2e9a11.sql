ALTER TABLE public.ftth_nodes
ADD COLUMN cable_fiber_number integer NOT NULL DEFAULT 1,
ADD CONSTRAINT ftth_nodes_cable_fiber_number_check CHECK (cable_fiber_number > 0);