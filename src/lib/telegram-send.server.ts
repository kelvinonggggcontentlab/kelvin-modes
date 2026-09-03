const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

/** Sends a message through the Telegram connector gateway. Throws on failure. */
export async function sendTelegramMessage(params: {
  chatId: number;
  text: string;
  lovableKey: string;
  telegramKey: string;
  businessConnectionId?: string | null | undefined;
}) {
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.lovableKey}`,
      "X-Connection-Api-Key": params.telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      // Chat Automation (Telegram Business) replies must be sent on the
      // business connection, otherwise the bot cannot write into that chat.
      ...(params.businessConnectionId
        ? { business_connection_id: params.businessConnectionId }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Telegram sendMessage failed [${res.status}]: ${body}`);
    throw new Error(`Telegram rejected the message [${res.status}]: ${body}`);
  }

  const data = (await res.json()) as { ok?: boolean; error_code?: number; description?: string };
  if (data.ok === false) {
    console.error(`Telegram sendMessage error: ${data.error_code} ${data.description}`);
    throw new Error(`Telegram error: ${data.description ?? "unknown"}`);
  }
}
