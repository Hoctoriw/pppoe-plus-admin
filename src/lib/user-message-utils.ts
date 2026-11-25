export function continuation(message: { id: string; recipient_id: string; subject: string }) {
  return { parentId: message.id, userIds: [message.recipient_id], subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}` };
}

export async function trackedDelivery(
  send: () => Promise<Response>,
  save: (result: { status: "sent" | "failed" | "unknown"; provider_message_id: string | null; error: string | null }) => Promise<void>,
) {
  let result: { status: "sent" | "failed" | "unknown"; provider_message_id: string | null; error: string | null };
  try {
    const response = await send();
    if (response.ok) {
      const payload = await response.json().catch(() => ({})) as { messageId?: string };
      result = { status: "sent", provider_message_id: payload.messageId ?? null, error: null };
    } else {
      result = { status: "failed", provider_message_id: null, error: `Brevo [${response.status}]: ${(await response.text()).slice(0, 300)}` };
    }
  } catch {
    result = { status: "unknown", provider_message_id: null, error: "Não foi possível confirmar o envio. Verifique os registros do Brevo antes de reenviar." };
  }
  await save(result);
  return result;
}