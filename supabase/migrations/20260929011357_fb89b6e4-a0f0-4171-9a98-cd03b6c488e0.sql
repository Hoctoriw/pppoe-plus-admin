ALTER TABLE public.ftth_nodes
ADD COLUMN cable_anchors jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ftth_nodes
ADD CONSTRAINT ftth_nodes_cable_anchors_array_check
CHECK (jsonb_typeof(cable_anchors) = 'array');