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
