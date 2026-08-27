import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listChats from "./tools/list-chats";
import getChat from "./tools/get-chat";
import setChatMode from "./tools/set-chat-mode";
import draftReply from "./tools/draft-reply";

// The OAuth issuer must be the direct Supabase host: on publish SUPABASE_URL is
// rewritten to a proxy, which fails the RFC 8414 issuer check.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "kelvin-s-aide",
  title: "Kelvin's Aide",
  version: "0.1.0",
  instructions:
    "Tools for the KELVIN REPRESENTATIVE by BLACKTOWER™ Telegram bot. Use `list_chats` and `get_chat` to inspect handled chats and their stored context, `set_chat_mode` to switch a chat between the secretary voice and Kelvin's direct voice, and `draft_reply` to draft a reply in either voice without sending it. Chat inspection and mode changes require an admin account.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listChats, getChat, setChatMode, draftReply],
});
