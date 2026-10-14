// Pool de IPs dos clientes ativos: 192.168.0.0/16 (exclui .0 e .255 de cada /24 e 192.168.0.x reservado ao gateway)
export const POOL_CIDR = "192.168.0.0/16";

export function inPool(ip: string) {
  const m = /^192\.168\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  return !!m && Number(m[1]) <= 255 && Number(m[2]) <= 255;
}

/** Itera IPs utilizáveis da pool em ordem. */
export function* poolIps(): Generator<string> {
  for (let a = 1; a <= 255; a++) for (let b = 1; b <= 254; b++) yield `192.168.${a}.${b}`;
}

export const POOL_SIZE = 255 * 254;

export function freeIps(used: Set<string>, limit = 50, startAfter?: string): string[] {
  const out: string[] = [];
  let started = !startAfter;
  for (const ip of poolIps()) {
    if (!started) { if (ip === startAfter) started = true; continue; }
    if (!used.has(ip)) { out.push(ip); if (out.length >= limit) break; }
  }
  return out;
}

export function nextFreeIp(used: Set<string>) { return freeIps(used, 1)[0] ?? null; }
