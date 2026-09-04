import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TelegramChatOption = {
  chat_id: number;
  mode: string;
  turns: number;
  business_chat: boolean;
  updated_at: string;
};

/** Telegram chats the bot has handled. Visible to admin operators only (RLS). */
export const listTelegramChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramChatOption[]> => {
    const { data, error } = await context.supabase
      .from("telegram_chats")
      .select("chat_id, mode, history, business_connection_id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) return [];
    return (data ?? []).map((row) => ({
      chat_id: Number(row.chat_id),
      mode: String(row.mode),
      turns: Array.isArray(row.history) ? row.history.length : 0,
      business_chat: Boolean(row.business_connection_id),
      updated_at: String(row.updated_at),
    }));
  });

/** Links (or unlinks, with null) a thread to a Telegram conversation. */
export const linkThreadToTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        telegramChatId: z.number().int().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chat_threads")
      .update({ telegram_chat_id: data.telegramChatId })
      .eq("id", data.threadId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true, telegramChatId: data.telegramChatId };
  });

/** Relays the operator's message to the linked Telegram chat and stores it in the thread. */
export const relayToTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ threadId: z.string().uuid(), text: z.string().trim().min(1).max(4000) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      throw new Error("Telegram is not configured on the server.");
    }

    const { data: thread, error } = await context.supabase
      .from("chat_threads")
      .select("id, telegram_chat_id")
      .eq("id", data.threadId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!thread?.telegram_chat_id) {
      throw new Error("This conversation is not linked to a Telegram chat.");
    }

    const chatId = Number(thread.telegram_chat_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tgChat } = await supabaseAdmin
      .from("telegram_chats")
      .select("business_connection_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    const { sendTelegramMessage } = await import("@/lib/telegram-send.server");

    const logDelivery = async (status: "sent" | "failed", errorMessage: string | null) => {
      const { error: logError } = await context.supabase.from("telegram_deliveries").insert({
        user_id: context.userId,
        thread_id: data.threadId,
        chat_id: chatId,
        direction: "outbound",
        status,
        error: errorMessage,
        preview: data.text.slice(0, 160),
      });
      if (logError) console.error("delivery log insert failed:", logError.message);
    };

    try {
      await sendTelegramMessage({
        chatId,
        text: data.text,
        lovableKey: LOVABLE_API_KEY,
        telegramKey: TELEGRAM_API_KEY,
        businessConnectionId: tgChat?.business_connection_id ?? null,
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Unknown Telegram error";
      await logDelivery("failed", message);
      throw new Error(message);
    }

    await logDelivery("sent", null);

    const { error: insertError } = await context.supabase.from("chat_messages").insert({
      thread_id: data.threadId,
      user_id: context.userId,
      role: "assistant",
      content: data.text,
    });
    if (insertError) console.error("relay message insert failed:", insertError.message);

    await context.supabase
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.threadId);

    return { ok: true };
  });
