import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { fromDbMode, type ChatMode } from "@/lib/chat-modes";
import {
  KELVIN_SYSTEM_PROMPT,
  NEXUS_SYSTEM_PROMPT,
  SECRETARY_SYSTEM_PROMPT,
  TOWER_SYSTEM_PROMPT,
} from "@/lib/persona.server";

const SYSTEM_PROMPT: Record<ChatMode, string> = {
  tower: TOWER_SYSTEM_PROMPT,
  secretary: SECRETARY_SYSTEM_PROMPT,
  kelvin: KELVIN_SYSTEM_PROMPT,
  nexus: NEXUS_SYSTEM_PROMPT,
};

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
        const SUPABASE_URL = process.env["SUPABASE_URL"];
        const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server not configured", { status: 500 });
        }

        const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const auth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userError } = await auth.auth.getUser(token);
        const userId = userData?.user?.id;
        if (userError || !userId) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { messages?: unknown; threadId?: unknown };
        if (!Array.isArray(body.messages) || typeof body.threadId !== "string") {
          return new Response("messages and threadId are required", { status: 400 });
        }
        const messages = body.messages as UIMessage[];
        const threadId = body.threadId;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: thread, error: threadError } = await supabaseAdmin
          .from("chat_threads")
          .select("id, mode, title")
          .eq("id", threadId)
          .eq("user_id", userId)
          .maybeSingle();

        if (threadError) return new Response(threadError.message, { status: 500 });
        if (!thread) return new Response("Thread not found", { status: 404 });

        const mode = fromDbMode(thread.mode);
        const last = messages[messages.length - 1];
        const prompt = last && last.role === "user" ? textOf(last) : "";
        if (!prompt) return new Response("No user message", { status: 400 });

        const { error: insertError } = await supabaseAdmin.from("chat_messages").insert({
          thread_id: threadId,
          user_id: userId,
          role: "user",
          content: prompt,
        });
        if (insertError) {
          console.error("chat_messages insert (user) failed:", insertError.message);
          return new Response("Could not save your message", { status: 500 });
        }

        // First message of an untitled thread becomes its title.
        if (thread.title === "New chat") {
          const title = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
          await supabaseAdmin.from("chat_threads").update({ title }).eq("id", threadId);
        } else {
          await supabaseAdmin
            .from("chat_threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", threadId);
        }

        try {
          const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
          const result = streamText({
            model: gateway("google/gemini-3.7-flash"),
            system: SYSTEM_PROMPT[mode],
            messages: await convertToModelMessages(messages),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: async ({ responseMessage }) => {
              const content = textOf(responseMessage);
              if (!content) return;
              const { error } = await supabaseAdmin.from("chat_messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                content,
              });
              if (error) console.error("chat_messages insert (assistant) failed:", error.message);
            },
          });
        } catch (err) {
          console.error("chat stream failed:", err);
          const status =
            err != null && typeof err === "object" && "statusCode" in err
              ? Number((err as { statusCode: unknown }).statusCode) || 500
              : 500;
          const message =
            status === 429
              ? "Too many messages right now — try again in a moment."
              : status === 402
                ? "AI credits are exhausted for this workspace."
                : "The assistant could not answer. Try again.";
          return new Response(message, { status });
        }
      },
    },
  },
});
