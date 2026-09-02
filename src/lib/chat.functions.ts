import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT_MODES, fromDbMode, toDbMode, type ChatMode } from "@/lib/chat-modes";

export type ChatThread = {
  id: string;
  title: string;
  mode: ChatMode;
  updated_at: string;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

const modeSchema = z.enum(CHAT_MODES);

/** Threads belonging to the signed-in operator, newest activity first. */
export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatThread[]> => {
    const { data, error } = await context.supabase
      .from("chat_threads")
      .select("id, title, mode, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      mode: fromDbMode(row.mode),
      updated_at: row.updated_at as string,
    }));
  });

/** Creates an empty thread and returns it. */
export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mode: modeSchema.default("tower") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<ChatThread> => {
    const { data: row, error } = await context.supabase
      .from("chat_threads")
      .insert({ user_id: context.userId, mode: toDbMode(data.mode), title: "New chat" })
      .select("id, title, mode, updated_at")
      .single();

    if (error) throw new Error(error.message);
    return {
      id: row.id as string,
      title: row.title as string,
      mode: fromDbMode(row.mode),
      updated_at: row.updated_at as string,
    };
  });

/** One thread plus its stored messages, or null when it is not the caller's. */
export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      context,
      data,
    }): Promise<{ thread: ChatThread; messages: StoredMessage[] } | null> => {
      const { data: row, error } = await context.supabase
        .from("chat_threads")
        .select("id, title, mode, updated_at")
        .eq("id", data.threadId)
        .eq("user_id", context.userId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!row) return null;

      const { data: messages, error: msgError } = await context.supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("thread_id", data.threadId)
        .order("created_at", { ascending: true });

      if (msgError) throw new Error(msgError.message);

      return {
        thread: {
          id: row.id as string,
          title: row.title as string,
          mode: fromDbMode(row.mode),
          updated_at: row.updated_at as string,
        },
        messages: (messages ?? []) as StoredMessage[],
      };
    },
  );

/** Switches the voice used for a thread. Existing messages stay in place. */
export const setThreadMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid(), mode: modeSchema }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chat_threads")
      .update({ mode: toDbMode(data.mode) })
      .eq("id", data.threadId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true, mode: data.mode };
  });

/** Renames a thread. */
export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid(), title: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chat_threads")
      .update({ title: data.title })
      .eq("id", data.threadId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Deletes a thread and, by cascade, its messages. */
export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chat_threads")
      .delete()
      .eq("id", data.threadId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
