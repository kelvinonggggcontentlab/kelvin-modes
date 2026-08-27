import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "set_chat_mode",
  title: "Set Telegram chat mode",
  description:
    "Switch a Telegram chat between 'secretary' (the office secretary takes the message) and 'kelvin' (replies in Kelvin's own voice). Clears that chat's stored context. Admin only.",
  inputSchema: {
    chat_id: z.number().describe("Telegram chat id, as returned by list_chats."),
    mode: z.enum(["secretary", "kelvin"]).describe("The reply voice to use for this chat."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ chat_id, mode }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("telegram_chats")
      .update({ mode, history: [] })
      .eq("chat_id", chat_id)
      .select("chat_id, mode");

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return {
        content: [
          { type: "text", text: "No chat was updated — unknown chat id, or your account is not an admin." },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: `Chat ${chat_id} is now in ${mode} mode (context cleared).` }],
      structuredContent: { chat: data[0] },
    };
  },
});
