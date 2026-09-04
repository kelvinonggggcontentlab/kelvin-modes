import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Turn = { role: "user" | "assistant"; content: string };
export type Mode = "kelvin" | "secretary" | "nexus";

export type ChatState = {
  mode: Mode;
  history: Turn[];
};

const MAX_TURNS = 12;

function isTurn(value: unknown): value is Turn {
  if (typeof value !== "object" || value === null) return false;
  const t = value as { role?: unknown; content?: unknown };
  return (t.role === "user" || t.role === "assistant") && typeof t.content === "string";
}

/** Secretary mode is the default until switched with /kelvin. */
export async function loadChatState(chatId: number): Promise<ChatState> {
  const { data, error } = await supabaseAdmin
    .from("telegram_chats")
    .select("mode, history")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error) {
    console.error("loadChatState failed:", error.message);
    return { mode: "secretary", history: [] };
  }

  const rawHistory = Array.isArray(data?.history) ? data.history : [];
  return {
    mode: data?.mode === "kelvin" || data?.mode === "nexus" ? data.mode : "secretary",
    history: rawHistory.filter(isTurn).slice(-MAX_TURNS),
  };
}

async function upsert(chatId: number, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("telegram_chats")
    .upsert({ chat_id: chatId, ...patch }, { onConflict: "chat_id" });
  if (error) console.error("telegram_chats upsert failed:", error.message);
}

export async function setMode(chatId: number, mode: Mode, businessConnectionId?: string) {
  const previous = await loadChatState(chatId);
  const { error: logError } = await supabaseAdmin.from("mode_events").insert({
    chat_id: chatId,
    from_mode: previous.mode,
    to_mode: mode,
    source: "telegram",
  });
  if (logError) console.error("mode_events insert failed:", logError.message);

  await upsert(chatId, {
    mode,
    history: [],
    ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
  });
}

export async function clearHistory(chatId: number) {
  await upsert(chatId, { history: [] });
}

export async function appendTurns(
  chatId: number,
  state: ChatState,
  turns: Turn[],
  businessConnectionId?: string,
) {
  const history = [...state.history, ...turns].slice(-MAX_TURNS);
  await upsert(chatId, {
    mode: state.mode,
    history,
    ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
  });
}

export type LinkedThread = { id: string; user_id: string };

/** The in-app chat thread an operator has linked to this Telegram chat, if any. */
export async function findLinkedThread(chatId: number): Promise<LinkedThread | null> {
  const { data, error } = await supabaseAdmin
    .from("chat_threads")
    .select("id, user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (error) {
    console.error("findLinkedThread failed:", error.message);
    return null;
  }
  return data ? { id: data.id as string, user_id: data.user_id as string } : null;
}

/** Mirrors an incoming Telegram message into the linked in-app thread. */
export async function mirrorIncoming(thread: LinkedThread, chatId: number, content: string) {
  const { error } = await supabaseAdmin
    .from("chat_messages")
    .insert({ thread_id: thread.id, user_id: thread.user_id, role: "user", content });
  if (error) console.error("mirrorIncoming insert failed:", error.message);

  const { error: logError } = await supabaseAdmin.from("telegram_deliveries").insert({
    user_id: thread.user_id,
    thread_id: thread.id,
    chat_id: chatId,
    direction: "inbound",
    status: "sent",
    preview: content.slice(0, 160),
  });
  if (logError) console.error("delivery log insert failed:", logError.message);

  await supabaseAdmin
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", thread.id);
}
