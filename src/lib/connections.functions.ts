import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConnectionCustomer = {
  id: string;
  full_name: string;
  technology: "pppoe" | "ipoe" | "hotspot";
  status: "active" | "suspended" | "pending" | "cancelled";
  pppoe_username: string | null;
  ipoe_ip: string | null;
  street: string | null;
  address_number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  plans: { name: string } | null;
};

async function ownerOf(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("owner_id")
    .eq("user_id", userId)
    .not("owner_id", "is", null)
    .maybeSingle();
  return (data?.owner_id as string | undefined) ?? userId;
}

type NominatimHit = { display_name: string; lat: number; lon: number; viewport?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } } };

async function nominatim(q: string, limit: number): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("accept-language", "pt-BR");
  const res = await fetch(url, { headers: { "User-Agent": "NexoraISP/1.0 (painel de provedor)" } });
  if (!res.ok) throw new Error(`Falha na busca de endereço [${res.status}].`);
  const rows = (await res.json()) as Array<{ display_name: string; lat: string; lon: string; boundingbox?: string[] }>;
  return rows.map((r) => {
    const b = r.boundingbox?.map(Number);
    return {
      display_name: r.display_name, lat: Number(r.lat), lon: Number(r.lon),
      ...(b && b.length === 4 ? { viewport: { southwest: { lat: b[0]!, lng: b[2]! }, northeast: { lat: b[1]!, lng: b[3]! } } } : {}),
    };
  });
}

export const listConnectionCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("customers")
      .select("id,full_name,technology,status,pppoe_username,ipoe_ip,street,address_number,district,city,state,postal_code,latitude,longitude,plans(name)")
      .eq("owner_id", owner)
      .order("full_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((customer): ConnectionCustomer => ({
      ...customer,
      ipoe_ip: customer.ipoe_ip === null ? null : String(customer.ipoe_ip),
    }));
  });

export const geocodeCustomerAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ customerId: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    const { data: customer, error } = await context.supabase
      .from("customers")
      .select("street,address_number,district,city,state,postal_code")
      .eq("id", data.customerId)
      .eq("owner_id", owner)
      .single();
    if (error || !customer) throw new Error("Cliente não encontrado.");

    const address = [customer.street, customer.address_number, customer.district, customer.city, customer.state, customer.postal_code, "Brasil"]
      .filter(Boolean)
      .join(", ");
    if (!customer.street || !customer.city || !customer.state) {
      throw new Error("Complete rua, cidade e estado no cadastro do cliente antes de localizar.");
    }

    const [match] = await nominatim(address, 1);
    if (!match) throw new Error("Endereço não encontrado. Confira os dados do cadastro.");
    const latitude = match.lat;
    const longitude = match.lon;
    const { error: updateError } = await context.supabase
      .from("customers")
      .update({ latitude, longitude })
      .eq("id", data.customerId)
      .eq("owner_id", owner);
    if (updateError) throw new Error(updateError.message);
    return { latitude, longitude, formattedAddress: match.display_name };
  });

export const saveCustomerCoordinates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({
    customerId: z.string().uuid(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).parse(value))
  .handler(async ({ data, context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("customers")
      .update({ latitude: data.latitude, longitude: data.longitude })
      .eq("id", data.customerId)
      .eq("owner_id", owner);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PlaceResult = {
  description: string;
  latitude: number;
  longitude: number;
  viewport?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
};

export const geocodePlaceQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ query: z.string().trim().min(3).max(200) }).parse(value))
  .handler(async ({ data }) => {
    const found = await nominatim(data.query, 5);
    return found.map((r): PlaceResult => ({ description: r.display_name, latitude: r.lat, longitude: r.lon, ...(r.viewport ? { viewport: r.viewport } : {}) }));
  });