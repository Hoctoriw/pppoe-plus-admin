import { expect, mock, test } from "bun:test";

// Exercise the actual public handlers, substituting only transport and storage.
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));

const customer = {
  id: "11111111-1111-4111-8111-111111111111", owner_id: "provider-a",
  document: "12345678901", pppoe_password: "test-password-before", status: "active", full_name: "Test subscriber",
};
let invoiceReads = 0;
const invoices = [{ id: "invoice-a", amount: 100, status: "paid" }];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => {
    if (table === "invoices") invoiceReads++;
    const query = {
      select: (_columns: string) => query,
      not: () => query,
      eq: (column: string, value: string) => {
        if (table === "invoices" && column === "owner_id") expect(value).toBe("provider-a");
        return query;
      },
      order: () => query,
      limit: async () => ({ data: table === "customers" ? [{ ...customer }] : invoices }),
      maybeSingle: async () => ({ data: { ...customer } }),
    };
    return query;
  } },
}));

test("portal login, invoice read, password revocation and fresh login", async () => {
  const priorKey = process.env["RADIUS_API_TOKEN"];
  process.env["RADIUS_API_TOKEN"] = "test-only-key";
  try {
    const exported = await import("../src/lib/portal.functions");
    const login = exported.portalLogin as unknown as (input: { data: { document: string; password: string } }) => Promise<{ token: string }>;
    const load = exported.portalData as unknown as (input: { data: { token: string } }) => Promise<{ customer: Record<string, unknown>; invoices: unknown[] }>;
    const session = await login({ data: { document: customer.document, password: customer.pppoe_password } });
    const before = await load({ data: session });
    expect(before.customer["full_name"]).toBe("Test subscriber");
    expect(before.customer).not.toHaveProperty("pppoe_password");
    expect(before.invoices).toEqual(invoices);
    expect(invoiceReads).toBe(1);
    customer.pppoe_password = "test-password-after";
    await expect(load({ data: session })).rejects.toThrow();
    expect(invoiceReads).toBe(1);
    await expect(login({ data: { document: customer.document, password: "test-password-before" } })).rejects.toThrow();
    const fresh = await login({ data: { document: customer.document, password: customer.pppoe_password } });
    expect((await load({ data: fresh })).invoices).toEqual(invoices);
    customer.status = "cancelled";
    await expect(load({ data: fresh })).rejects.toThrow();
    expect(invoiceReads).toBe(2);
    expect(invoices).toEqual([{ id: "invoice-a", amount: 100, status: "paid" }]);
  } finally {
    if (priorKey === undefined) delete process.env["RADIUS_API_TOKEN"];
    else process.env["RADIUS_API_TOKEN"] = priorKey;
  }
});