import { expect, test } from "bun:test";
import { assertPortalSession, makePortalToken, readPortalToken, type PortalIdentity } from "../src/lib/portal-session.server";

const key = "test-only-portal-signing-key";
const now = Date.parse("2026-11-25T01:45:00Z");
const customer: PortalIdentity = { id: "11111111-1111-4111-8111-111111111111", owner_id: "owner-a", document: "12345678901", pppoe_password: "test-password-old", status: "active" };
const claims = () => readPortalToken(makePortalToken(customer, key, now), key, now);

test("changing connection password immediately revokes an unexpired portal session", () => {
  expect(() => assertPortalSession(claims(), { ...customer, pppoe_password: "test-password-new" }, key)).toThrow();
});
test("removing connection password revokes a portal session", () => {
  expect(() => assertPortalSession(claims(), { ...customer, pppoe_password: null }, key)).toThrow();
});
test("customer status changes revoke previously issued portal sessions", () => {
  expect(() => assertPortalSession(claims(), { ...customer, status: "cancelled" }, key)).toThrow();
});
test("deleted customers cannot use old portal sessions", () => {
  expect(() => assertPortalSession(claims(), null, key)).toThrow();
});
test("moving customers between providers revokes their prior portal sessions", () => {
  expect(() => assertPortalSession(claims(), { ...customer, owner_id: "owner-b" }, key)).toThrow();
});
test("unchanged credentials retain access for eight hours but not at expiry", () => {
  const token = makePortalToken(customer, key, now);
  expect(() => assertPortalSession(readPortalToken(token, key, now + 8 * 3600_000 - 1), customer, key)).not.toThrow();
  expect(() => readPortalToken(token, key, now + 8 * 3600_000)).toThrow();
});
test("suspended customers can still sign in to pay invoices", () => {
  const suspended = { ...customer, status: "suspended" };
  expect(() => assertPortalSession(readPortalToken(makePortalToken(suspended, key, now), key, now), suspended, key)).not.toThrow();
});
test("legacy tokens and altered tokens are rejected", () => {
  const token = makePortalToken(customer, key, now);
  const parts = token.split(".");
  expect(() => readPortalToken(`${parts[0]}.${parts[1]}.${parts[3]}`, key, now)).toThrow();
  expect(() => readPortalToken(token.replace("11111111", "22222222"), key, now)).toThrow();
  expect(() => readPortalToken(`${token}.extra`, key, now)).toThrow();
  expect(token).not.toContain("test-password-old");
});