import { test, expect } from "bun:test";
import { continuation, trackedDelivery } from "../src/lib/user-message-utils";

test("continuing an attendance selects the original recipient and links the prior message", () => {
  expect(continuation({ id: "message-1", recipient_id: "user-1", subject: "Teste de acesso" })).toEqual({ parentId: "message-1", userIds: ["user-1"], subject: "Re: Teste de acesso" });
  expect(continuation({ id: "message-2", recipient_id: "user-1", subject: "Re: Teste de acesso" }).subject).toBe("Re: Teste de acesso");
});

test("accepted sends are saved with the provider identifier", async () => {
  const saved: unknown[] = [];
  await trackedDelivery(async () => new Response(JSON.stringify({ messageId: "brevo-123" }), { status: 201 }), async (r) => { saved.push(r); });
  expect(saved).toEqual([{ status: "sent", provider_message_id: "brevo-123", error: null }]);
});

test("rejected sends remain in history as failures", async () => {
  const saved: unknown[] = [];
  await trackedDelivery(async () => new Response("permission_denied", { status: 403 }), async (r) => { saved.push(r); });
  expect(saved).toEqual([{ status: "failed", provider_message_id: null, error: "Brevo [403]: permission_denied" }]);
});

test("network interruptions never falsely claim delivery or resend automatically", async () => {
  const saved: unknown[] = [];
  const result = await trackedDelivery(async () => { throw new Error("timeout"); }, async (r) => { saved.push(r); });
  expect(result.status).toBe("unknown");
  expect(saved.length).toBe(1);
});