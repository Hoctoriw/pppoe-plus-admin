import { createHmac, timingSafeEqual } from "node:crypto";

export type PortalIdentity = {
  id: string;
  owner_id: string;
  document: string;
  pppoe_password: string | null;
  status: string;
};

const expired = () => new Error("Sessão expirada. Entre novamente.");
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("hex");
const equal = (a: string, b: string) => /^[a-f0-9]{64}$/.test(b) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function revision(customer: PortalIdentity, key: string) {
  if (!customer.pppoe_password) throw expired();
  // Keyed digest: the token never contains the password or an unkeyed password hash.
  return sign(JSON.stringify(["portal-identity-v1", customer.id, customer.owner_id, customer.document, customer.pppoe_password, customer.status]), key);
}

export function makePortalToken(customer: PortalIdentity, key: string, now = Date.now()) {
  const payload = `${customer.id}.${now + 8 * 3600_000}.${revision(customer, key)}`;
  return `${payload}.${sign(payload, key)}`;
}

export function readPortalToken(token: string, key: string, now = Date.now()) {
  const parts = token.split(".");
  const [id, exp, credentialRevision, signature] = parts;
  if (parts.length !== 4 || !id || !exp || !credentialRevision || !signature ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    !/^\d+$/.test(exp) || !Number.isSafeInteger(Number(exp)) || Number(exp) <= now ||
    !equal(sign(`${id}.${exp}.${credentialRevision}`, key), signature)) throw expired();
  return { id, credentialRevision };
}

export function assertPortalSession(claims: ReturnType<typeof readPortalToken>, customer: PortalIdentity | null, key: string) {
  if (!customer || customer.id !== claims.id || !equal(revision(customer, key), claims.credentialRevision)) throw expired();
}