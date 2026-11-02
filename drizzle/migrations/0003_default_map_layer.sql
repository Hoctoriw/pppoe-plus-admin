ALTER TABLE public.app_settings ADD COLUMN default_map_layer text NOT NULL DEFAULT 'google_hybrid';
CREATE OR REPLACE FUNCTION public.set_default_map_layer(_layer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas o administrador pode alterar o mapa padrão.'; END IF;
  IF _layer NOT IN ('google_hybrid','google_streets','google_satellite','osm','esri') THEN RAISE EXCEPTION 'Mapa inválido'; END IF;
  INSERT INTO public.app_settings(id, default_map_layer, updated_at) VALUES (1, _layer, now())
  ON CONFLICT (id) DO UPDATE SET default_map_layer = EXCLUDED.default_map_layer, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_default_map_layer(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_default_map_layer(text) TO authenticated;