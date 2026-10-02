<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- MikroTik integration uses RouterOS 7 REST (HTTPS, basic auth) from server functions in src/lib/mikrotik.*; router credentials live in admin-only `routers` table and are read via service role after role check — why: Workers can only reach routers over HTTP(S), and passwords must never reach the browser.
- Boleto emission goes through provider adapters in src/lib/billing.server.ts (Asaas first); API keys live in admin-only `bank_accounts` table, read via service role after role check. The Asaas webhook (/api/public/webhooks/asaas) never trusts the payload — it confirms payment status via the provider API before marking invoices paid — why: fake webhook posts must not trigger baixa automática.
- The local FreeRADIUS server (installed by public/radius-install.sh) queries the panel through rlm_rest at /api/public/radius/{authorize,accounting}, authenticated by the RADIUS_API_TOKEN secret — why: the database password isn't available and RADIUS uses UDP, so HTTPS is the only bridge.
- Multi-tenant: every business table (plans, customers, routers, bank_accounts, invoices, customer_equipment) has owner_id (default auth.uid()) and RLS owner_id = auth.uid(); service-role server code must always filter by owner_id = context.userId — why: each user runs a fully isolated ISP panel. user_roles 'admin' now means platform admin (users page, RADIUS installer).
- Customer network locations store latitude/longitude on customers; address geocoding is authenticated and server-side through Google Maps, while map rendering uses the connector browser key — why: coordinates must remain tenant-scoped and private credentials must never reach the browser.
- FTTH data is client-edited under tenant RLS; each child stores cable data, selected fiber, and ordered anchors, with live signal and routed-distance calculation. New children of unbalanced splitters default to the higher-percentage pass output.
- On-premise: public/nexora-onprem-install.sh builds the app with NITRO_PRESET=node-server and runs it behind Nginx with self-hosted Supabase in Docker — why: lets ISPs run the full panel offline on their own IP.
- On-premise sync is two-way: the local server POSTs rows changed since its last push to /api/public/onprem/push and then pulls /api/public/onprem/export, both with the per-owner token (sha256 in onprem_sync_tokens); newest updated_at wins, rows of other owners are never touched, router passwords/bank keys never travel, and local-only accounts become cloud team members (new cloud users only, never existing ones) — why: offline-first operation without cross-tenant writes.

- Cloud→local sync has a native pairing path: local panel (Backup page) requests a 6-digit code at /api/public/onprem/pair-request, owner approves it in the online Backup page, and the local cron (nexora-cloud-pair) polls /api/public/onprem/pair-status to receive the sync token once — why: avoids copying long keys in the terminal; manual nexora-sync-setup key remains as fallback.
- Login nativo da nuvem no servidor local: login local com conta da nuvem (/api/public/onprem/cloud-login) cria a mesma conta (mesmo id) como admin e entrega a chave de sync ao agendador (cloud_pairing_state status 'ready') — why: dispensa código e nexora-make-admin.
