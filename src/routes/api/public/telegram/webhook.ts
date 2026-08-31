import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  KELVIN_SYSTEM_PROMPT,
  NEXUS_SYSTEM_PROMPT,
  SECRETARY_SYSTEM_PROMPT,
} from "@/lib/persona.server";
import {
  appendTurns,
  clearHistory,
  loadChatState,
  setMode,
} from "@/lib/telegram-state.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function deriveTelegramWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${telegramApiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type Mode = "kelvin" | "secretary" | "nexus";

const MODE_LABEL: Record<Mode, string> = {
  secretary: "SECRETARY",
  kelvin: "KELVIN (direct voice)",
  nexus: "NEXUS (chatty)",
};

const SYSTEM_PROMPT: Record<Mode, string> = {
  secretary: SECRETARY_SYSTEM_PROMPT,
  kelvin: KELVIN_SYSTEM_PROMPT,
  nexus: NEXUS_SYSTEM_PROMPT,
};


type TgMessage = {
  chat?: { id?: number };
  from?: { id?: number; is_bot?: boolean };
  text?: string;
  business_connection_id?: string;
};

async function sendMessage(
  chatId: number,
  text: string,
  lovableKey: string,
  telegramKey: string,
  businessConnectionId?: string,
) {
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      // Chat Automation (Telegram Business) replies must be sent on the
      // business connection, otherwise the bot cannot write into that chat.
      ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Telegram sendMessage failed [${res.status}]: ${body}`);
    return;
  }

  const data = (await res.json()) as { ok?: boolean; error_code?: number; description?: string };
  if (data.ok === false) {
    console.error(`Telegram sendMessage error: ${data.error_code} ${data.description}`);
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
        const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
        if (!TELEGRAM_API_KEY || !LOVABLE_API_KEY) {
          console.error("Missing TELEGRAM_API_KEY or LOVABLE_API_KEY");
          return new Response("Server not configured", { status: 500 });
        }

        const expected = deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as {
          update_id?: number;
          message?: TgMessage;
          edited_message?: TgMessage;
          business_message?: TgMessage;
          edited_business_message?: TgMessage;
        };

        const message =
          update.business_message ??
          update.edited_business_message ??
          update.message ??
          update.edited_message;
        const chatId = message?.chat?.id;
        const text = message?.text?.trim();
        const businessConnectionId = message?.business_connection_id;

        if (typeof chatId !== "number" || !text || message?.from?.is_bot) {
          return Response.json({ ok: true, ignored: true });
        }

        // In business chats Telegram also delivers messages Kelvin himself sends
        // (from.id = his account, chat.id = the customer). Never reply to those.
        if (businessConnectionId && message?.from?.id !== chatId) {
          return Response.json({ ok: true, ignored: true });
        }

        const reply = (out: string) =>
          sendMessage(chatId, out, LOVABLE_API_KEY, TELEGRAM_API_KEY, businessConnectionId);

        // Mode and recent context live in the database, so they survive redeploys.
        const state = await loadChatState(chatId);

        if (text === "/start" || text === "/help") {
          await reply(
            [
              "BLACKTOWER™ — KELVIN REPRESENTATIVE",
              "",
              `Current mode: ${MODE_LABEL[state.mode]}`,
              "",
              "/secretary — office secretary handles your message",
              "/kelvin — replies in Kelvin's own voice",
              "/nexus — NEXUS, the chatty Malaysian trend-talker",
              "/mode — show current mode",
              "/reset — clear the conversation context",
            ].join("\n"),
          );
          return Response.json({ ok: true });
        }

        if (text === "/secretary" || text === "/kelvin" || text === "/nexus") {
          const next: Mode =
            text === "/secretary" ? "secretary" : text === "/kelvin" ? "kelvin" : "nexus";
          await setMode(chatId, next, businessConnectionId);
          await reply(
            next === "secretary"
              ? "Secretary mode on. I'll take your message and pass it to Kelvin for confirmation."
              : next === "kelvin"
                ? "kelvin here 咯"
                : "NEXUS here wei 👋 what's up, anything hot going on your side?",
          );
          return Response.json({ ok: true });
        }

        if (text === "/mode") {
          await reply(`Mode: ${MODE_LABEL[state.mode]}`);
          return Response.json({ ok: true });
        }

        if (text === "/reset") {
          await clearHistory(chatId);
          await reply("cleared 咯");
          return Response.json({ ok: true });
        }

        try {
          const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
          const { text: generated } = await generateText({
            model: gateway("google/gemini-3.7-flash"),
            system: SYSTEM_PROMPT[state.mode],
            messages: [...state.history, { role: "user", content: text }],
          });

          const out = generated.trim() || "ok";
          await appendTurns(
            chatId,
            state,
            [
              { role: "user", content: text },
              { role: "assistant", content: out },
            ],
            businessConnectionId,
          );
          await reply(out);
        } catch (err) {
          console.error("AI reply failed:", err);
          await reply("system got problem now, text me again later 咯");
        }

        return Response.json({ ok: true });
      },
    },
  },
});
