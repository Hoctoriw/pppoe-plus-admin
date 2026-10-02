-- Pareamento do servidor local (on-premise) com a nuvem, sem colar chaves no terminal.
-- 1) O painel local pede um código em /api/public/onprem/pair-request.
-- 2) O dono aprova o código na página Backup do painel online.
-- 3) O servidor local consulta /api/public/onprem/pair-status e recebe a chave de sincronismo.

create table public.onprem_pairings (
  code text primary key,
  poll_hash text not null,
  hostname text,
  local_ip text,
  status text not null default 'pending' check (status in ('pending','approved','delivered')),
  owner_id uuid,
  issued_token text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.onprem_pairings enable row level security;
grant all on public.onprem_pairings to service_role;

-- Estado do pareamento guardado no painel LOCAL (na nuvem esta tabela fica vazia).
create table public.cloud_pairing_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  online_url text not null,
  code text not null,
  poll_secret text not null,
  status text not null default 'pending' check (status in ('pending','connected')),
  created_at timestamptz not null default now()
);
alter table public.cloud_pairing_state enable row level security;
grant select, insert, update, delete on public.cloud_pairing_state to authenticated;
grant all on public.cloud_pairing_state to service_role;
create policy "Dono gerencia o pareamento do próprio servidor"
  on public.cloud_pairing_state for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
