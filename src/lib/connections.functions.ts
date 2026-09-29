import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConnectionCustomer = {
  id: string;
  full_name: string;
  technology: "pppoe" | "ipoe";
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

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Google Maps não está configurado.");
    const url = new URL("https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("region", "br");
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
      },
    });
    if (response.status === 403) {
      const body = await response.json().catch(() => ({})) as { error?: { details?: Array<{ reason?: string }> } };
      const reason = body.error?.details?.find((detail) => detail.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") throw new Error("A chave de servidor do Google Maps não permite consultas pelo painel.");
      if (reason === "API_KEY_SERVICE_BLOCKED") throw new Error("Ative a API de Geocodificação na conexão do Google Maps.");
      throw new Error("O Google Maps recusou a consulta do endereço.");
    }
    if (!response.ok) throw new Error(`Falha ao localizar endereço [${response.status}]: ${await response.text()}`);
    const result = await response.json() as {
      status?: string;
      error_message?: string;
      results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>;
    };
    const match = result.results?.[0];
    if (!match) throw new Error(result.error_message || "Endereço não encontrado. Confira os dados do cadastro.");
    const latitude = match.geometry.location.lat;
    const longitude = match.geometry.location.lng;
    const { error: updateError } = await context.supabase
      .from("customers")
      .update({ latitude, longitude })
      .eq("id", data.customerId)
      .eq("owner_id", owner);
    if (updateError) throw new Error(updateError.message);
    return { latitude, longitude, formattedAddress: match.formatted_address };
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
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Google Maps não está configurado.");
    const url = new URL("https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json");
    url.searchParams.set("address", data.query);
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("region", "br");
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
      },
    });
    if (response.status === 403) {
      const body = await response.json().catch(() => ({})) as { error?: { details?: Array<{ reason?: string }> } };
      const reason = body.error?.details?.find((detail) => detail.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") throw new Error("A chave de servidor do Google Maps não permite consultas pelo painel.");
      if (reason === "API_KEY_SERVICE_BLOCKED") throw new Error("Ative a API de Geocodificação na conexão do Google Maps.");
      throw new Error("O Google Maps recusou a consulta.");
    }
    if (!response.ok) throw new Error(`Falha na busca [${response.status}]: ${await response.text()}`);
    const result = await response.json() as {
      status?: string;
      error_message?: string;
      results?: Array<{
        formatted_address: string;
        geometry: {
          location: { lat: number; lng: number };
          viewport?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
        };
      }>;
    };
    if (result.status === "ZERO_RESULTS" || !result.results?.length) return [] as PlaceResult[];
    return result.results.slice(0, 5).map((r): PlaceResult => ({
      description: r.formatted_address,
      latitude: r.geometry.location.lat,
      longitude: r.geometry.location.lng,
      ...(r.geometry.viewport ? { viewport: r.geometry.viewport } : {}),
    }));
  });