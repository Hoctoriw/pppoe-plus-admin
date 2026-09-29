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
- FTTH network (ftth_nodes: OLT/CEO/CTO tree via parent_id, cable data stored on the child node; customers.cto_id/cto_port) is edited from the browser client under owner/team RLS, and signal budget is computed client-side in src/lib/ftth.ts — why: it's tenant data with no secrets, and losses must update instantly while drawing.
