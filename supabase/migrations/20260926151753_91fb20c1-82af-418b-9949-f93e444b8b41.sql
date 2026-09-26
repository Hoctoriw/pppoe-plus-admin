ALTER TABLE public.customers
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT customers_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT customers_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL));