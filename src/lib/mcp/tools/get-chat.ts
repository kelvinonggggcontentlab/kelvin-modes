import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_chat",
  title: "Get Telegram chat context",
  description:
    "Read one Telegram chat's current reply mode and its stored recent conversation turns, by chat id. Admin only.",
  inputSchema: {
    chat_id: z.number().describe("Telegram chat id, as returned by list_chats."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ chat_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("telegram_chats")
      .select("chat_id, mode, history, updated_at")
      .eq("chat_id", chat_id)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: "No such chat, or your account is not an admin." }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { chat: data },
    };
  },
});
