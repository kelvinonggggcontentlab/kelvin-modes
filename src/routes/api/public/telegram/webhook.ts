import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { KELVIN_SYSTEM_PROMPT, SECRETARY_SYSTEM_PROMPT } from "@/lib/persona.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function deriveTelegramWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${telegramApiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type Turn = { role: "user" | "assistant"; content: string };
type Mode = "kelvin" | "secretary";
const history = new Map<number, Turn[]>();
const modes = new Map<number, Mode>();

// Secretary mode is the default: the bot answers as Kelvin's secretary until
// switched to his direct voice with /kelvin.
function getMode(chatId: number): Mode {
  return modes.get(chatId) ?? "secretary";
}

function remember(chatId: number, turn: Turn) {
  const turns = history.get(chatId) ?? [];
  turns.push(turn);
  history.set(chatId, turns.slice(-12));
}

async function sendMessage(chatId: number, text: string, lovableKey: string, telegramKey: string) {
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
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
          message?: { chat?: { id?: number }; text?: string };
          edited_message?: { chat?: { id?: number }; text?: string };
        };

        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        const text = message?.text?.trim();

        if (typeof chatId !== "number" || !text) {
          return Response.json({ ok: true, ignored: true });
        }

        if (text === "/start" || text === "/help") {
          await sendMessage(
            chatId,
            [
              "BLACKTOWER™ — KELVIN REPRESENTATIVE",
              "",
              `Current mode: ${getMode(chatId) === "secretary" ? "SECRETARY" : "KELVIN (direct voice)"}`,
              "",
              "/secretary — office secretary handles your message",
              "/kelvin — replies in Kelvin's own voice",
              "/mode — show current mode",
              "/reset — clear the conversation context",
            ].join("\n"),
            LOVABLE_API_KEY,
            TELEGRAM_API_KEY,
          );
          return Response.json({ ok: true });
        }

        if (text === "/secretary" || text === "/kelvin") {
          const next: Mode = text === "/secretary" ? "secretary" : "kelvin";
          modes.set(chatId, next);
          history.delete(chatId);
          await sendMessage(
            chatId,
            next === "secretary"
              ? "Secretary mode on. I'll take your message and pass it to Kelvin for confirmation."
              : "kelvin here 咯",
            LOVABLE_API_KEY,
            TELEGRAM_API_KEY,
          );
          return Response.json({ ok: true });
        }

        if (text === "/mode") {
          await sendMessage(
            chatId,
            getMode(chatId) === "secretary" ? "Mode: SECRETARY" : "Mode: KELVIN (direct voice)",
            LOVABLE_API_KEY,
            TELEGRAM_API_KEY,
          );
          return Response.json({ ok: true });
        }

        if (text === "/reset") {
          history.delete(chatId);
          await sendMessage(chatId, "cleared 咯", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          return Response.json({ ok: true });
        }

        try {
          const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
          const { text: reply } = await generateText({
            model: gateway("google/gemini-3.7-flash"),
            system: getMode(chatId) === "secretary" ? SECRETARY_SYSTEM_PROMPT : KELVIN_SYSTEM_PROMPT,
            messages: [...(history.get(chatId) ?? []), { role: "user", content: text }],
          });

          const out = reply.trim() || "ok";
          remember(chatId, { role: "user", content: text });
          remember(chatId, { role: "assistant", content: out });
          await sendMessage(chatId, out, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } catch (err) {
          console.error("AI reply failed:", err);
          await sendMessage(
            chatId,
            "system got problem now, text me again later 咯",
            LOVABLE_API_KEY,
            TELEGRAM_API_KEY,
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
