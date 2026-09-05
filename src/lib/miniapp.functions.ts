import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type VisitorRequestView = {
  id: string;
  name: string;
  company: string | null;
  purpose: string;
  preferred_time: string | null;
  status: "pending" | "reviewed" | "closed";
  operator_note: string | null;
  created_at: string;
};

const submitSchema = z.object({
  chatId: z.number().int(),
  telegramUserId: z.number().int().nullable().optional(),
  username: z.string().max(120).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  purpose: z.string().trim().min(5).max(1200),
  preferredTime: z.string().trim().max(160).optional(),
  contact: z.string().trim().max(200).optional(),
});

/**
 * Public endpoint used by the Telegram mini app. It only ever writes a new
 * enquiry and confirms receipt in the visitor's own chat — nothing is approved,
 * priced or committed here.
 */
export const submitVisitorRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("visitor_requests")
      .insert({
        chat_id: data.chatId,
        telegram_user_id: data.telegramUserId ?? null,
        telegram_username: data.username ?? null,
        name: data.name,
        company: data.company || null,
        purpose: data.purpose,
        preferred_time: data.preferredTime || null,
        contact: data.contact || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("visitor_requests insert failed:", error.message);
      throw new Error("Could not save the request. Please try again.");
    }

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const telegramKey = process.env["TELEGRAM_API_KEY"];
    if (lovableKey && telegramKey) {
      const { sendTelegramMessage } = await import("@/lib/telegram-send.server");
      const { data: chat } = await supabaseAdmin
        .from("telegram_chats")
        .select("business_connection_id")
        .eq("chat_id", data.chatId)
        .maybeSingle();

      try {
        await sendTelegramMessage({
          chatId: data.chatId,
          text: [
            "Noted, thank you. Your request has been recorded:",
            "",
            `Name: ${data.name}`,
            data.company ? `Company: ${data.company}` : null,
            `Purpose: ${data.purpose}`,
            data.preferredTime ? `Preferred time: ${data.preferredTime}` : null,
            data.contact ? `Contact: ${data.contact}` : null,
            "",
            "Kelvin will review and confirm. Nothing is approved yet.",
          ]
            .filter(Boolean)
            .join("\n"),
          lovableKey,
          telegramKey,
          businessConnectionId: chat?.business_connection_id ?? null,
        });
      } catch (sendError) {
        console.error("mini app confirmation send failed:", sendError);
      }
    }

    return { id: row.id as string };
  });

/** Status list for the visitor's own submissions, keyed by their Telegram chat. */
export const listVisitorRequests = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ chatId: z.number().int() }).parse(input))
  .handler(async ({ data }): Promise<VisitorRequestView[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("visitor_requests")
      .select("id, name, company, purpose, preferred_time, status, operator_note, created_at")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("visitor_requests read failed:", error.message);
      return [];
    }

    return (rows ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      company: (row.company as string | null) ?? null,
      purpose: String(row.purpose),
      preferred_time: (row.preferred_time as string | null) ?? null,
      status: row.status as VisitorRequestView["status"],
      operator_note: (row.operator_note as string | null) ?? null,
      created_at: String(row.created_at),
    }));
  });
