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
