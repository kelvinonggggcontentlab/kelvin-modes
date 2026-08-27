import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_chats",
  title: "List Telegram chats",
  description:
    "List the Telegram chats the bot has handled, with each chat's current reply mode (secretary or kelvin) and how many stored conversation turns it has. Admin only.",
  inputSchema: {
    limit: z.number().int().describe("How many chats to return, most recently active first."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const take = Math.min(Math.max(Math.trunc(limit || 20), 1), 100);
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("telegram_chats")
      .select("chat_id, mode, history, business_connection_id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(take);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const chats = (data ?? []).map((row) => ({
      chat_id: row.chat_id,
      mode: row.mode,
      turns: Array.isArray(row.history) ? row.history.length : 0,
      business_chat: Boolean(row.business_connection_id),
      updated_at: row.updated_at,
    }));

    if (chats.length === 0) {
      return {
        content: [{ type: "text", text: "No chats stored yet (or your account is not an admin)." }],
        structuredContent: { chats },
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(chats, null, 2) }],
      structuredContent: { chats },
    };
  },
});
