import { afterEach, expect, test, mock } from "bun:test";
import { approvedRouterDestination, fetchApprovedRouter, requireRouterMaster, routerDestination } from "../src/lib/router-destination-guards";

const router = { id: "router-a", owner_id: "owner-a", base_url: "https://router.example.com", username: "test", password: "test" };
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
function database(rows: Record<string, string>[] = []) {
  return { from: (table: string) => {
    expect(table).toBe("router_destination_approvals");
    return { select: () => {
      const filters: [string, string][] = [];
      const query = { eq: (key: string, value: string) => { filters.push([key, value]); return query; },
        maybeSingle: async () => ({ error: null, data: rows.find(row => filters.every(([key, value]) => row[key] === value)) ?? null }) };
      return query;
    } };
  } };
}
const approval = { router_id: router.id, owner_id: router.owner_id, base_url: router.base_url };

test("only master may approve router destinations", async () => {
  for (const role of [false, null]) {
    await expect(requireRouterMaster({ userId: "user", supabase: { rpc: async () => ({ data: role, error: null }) } })).rejects.toThrow("Somente o master");
  }
  await requireRouterMaster({ userId: "master", supabase: { rpc: async () => ({ data: true, error: null }) } });
});
test("unapproved destinations never cause outbound requests", async () => {
  const fetchSpy = mock(async () => new Response("{}")); globalThis.fetch = fetchSpy as unknown as typeof fetch;
  await expect(fetchApprovedRouter(database(), router, "GET", "/system/resource")).rejects.toThrow("não aprovado");
  expect(fetchSpy).toHaveBeenCalledTimes(0);
});
test("master approval permits only the exact router and owner destination", async () => {
  expect(await approvedRouterDestination(database([approval]), router)).toBe(router.base_url);
  for (const changed of [{ ...router, id: "router-b" }, { ...router, owner_id: "owner-b" }, { ...router, base_url: "https://other.example.com" }, { ...router, base_url: "https://router.example.com:8443" }]) {
    await expect(approvedRouterDestination(database([approval]), changed)).rejects.toThrow("não aprovado");
  }
});
test("revoked approval blocks the next request", async () => {
  const rows = [approval]; const db = database(rows);
  await approvedRouterDestination(db, router); rows.splice(0);
  await expect(approvedRouterDestination(db, router)).rejects.toThrow("não aprovado");
});
test("approved requests refuse redirects and preserve the approved origin", async () => {
  const fetchSpy = mock(async (_url: URL | RequestInfo, init?: RequestInit) => {
    expect(String(_url)).toBe("https://router.example.com/rest/system/resource");
    expect(init?.redirect).toBe("error");
    return new Response("{}", { status: 200 });
  }); globalThis.fetch = fetchSpy as unknown as typeof fetch;
  expect((await fetchApprovedRouter(database([approval]), router, "GET", "/system/resource")).status).toBe(200);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});
test("direct approvals reject private addresses, insecure schemes and URL paths", () => {
  for (const url of ["https://127.0.0.1", "https://192.168.1.1", "http://router.example.com", "https://router.example.com/anything", "https://router.example.com?target=elsewhere", "https://router.example.com#fragment", "https://user:pass@router.example.com"]) {
    expect(() => routerDestination(url)).toThrow();
  }
  expect(routerDestination("https://ROUTER.example.com:443/")).toBe(router.base_url);
});