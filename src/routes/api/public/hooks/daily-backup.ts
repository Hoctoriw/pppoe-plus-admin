import { createFileRoute } from "@tanstack/react-router";

async function authorized(request: Request): Promise<boolean> {
  const expected = process.env["SYNC_CRON_TOKEN"];
  if (!expected) return false;
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const d = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(d(token), d(expected));
}

const TABLES = [
  ["plans", "Planos", "*"],
  ["customers", "Clientes", "*"],
  ["customer_equipment", "Equipamentos", "*"],
  ["routers", "Roteadores", "id,name,base_url,username,dhcp_server,connection_mode,active,radius_enabled,radius_host,radius_auth_port,radius_acct_port,created_at"],
  ["bank_accounts", "Bancos", "id,name,bank_code,agency,agency_digit,account_number,account_digit,wallet,convenio,provider,environment,active,created_at"],
  ["invoices", "Cobranças", "*"],
] as const;

// Backup diário: chamado à 0h (horário de Brasília) pelo agendador do banco.
export const Route = createFileRoute("/api/public/hooks/daily-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const { data: settings } = await db.from("backup_settings").select("owner_id,email").limit(500);
        const now = new Date();
        const day = now.toISOString().slice(0, 10);
        const date = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        let sent = 0;
        const errors: string[] = [];
        for (const s of settings ?? []) {
          try {
            const data: Record<string, unknown[]> = {};
            const counts: Record<string, number> = {};
            for (const [t, label, cols] of TABLES) {
              const { data: rows, error } = await db.from(t).select(cols).eq("owner_id", s.owner_id);
              if (error) throw new Error(error.message);
              data[t] = rows ?? [];
              counts[label] = rows?.length ?? 0;
            }
            const res = await sendTemplateEmail("backup", s.email, {
              templateData: { date, counts, json: JSON.stringify({ generated_at: now.toISOString(), ...data }, null, 1) },
              idempotencyKey: `backup-daily-${s.owner_id}-${day}`,
            });
            if (res.sent) {
              sent++;
              await db.from("backup_settings").update({ last_sent_at: now.toISOString() }).eq("owner_id", s.owner_id);
            }
          } catch (e) {
            errors.push(`${s.owner_id}: ${(e as Error).message}`);
          }
        }
        if (errors.length) console.error("daily-backup errors", errors);
        return Response.json({ sent, errors: errors.length });
      },
    },
  },
});
