import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { KELVIN_SYSTEM_PROMPT, SECRETARY_SYSTEM_PROMPT } from "@/lib/persona.server";

export default defineTool({
  name: "draft_reply",
  title: "Draft a reply",
  description:
    "Draft a reply to an incoming message in the BLACKTOWER voice — either the office secretary voice or Kelvin's own Malaysian Chinese / Manglish voice. Returns text only; it does not send anything to Telegram.",
  inputSchema: {
    message: z.string().describe("The incoming message to reply to."),
    voice: z
      .enum(["secretary", "kelvin"])
      .describe("Which voice to draft in: 'secretary' or 'kelvin'."),
  },
  outputSchema: { voice: z.string(), draft: z.string() },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ message, voice }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ToolError("LOVABLE_API_KEY is not configured on the server.");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const { text } = await generateText({
      model: gateway("google/gemini-3.7-flash"),
      system: voice === "kelvin" ? KELVIN_SYSTEM_PROMPT : SECRETARY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const draft = text.trim();
    if (!draft) throw new ToolError("The model returned an empty draft.");

    return {
      content: [{ type: "text", text: draft }],
      structuredContent: { voice, draft },
    };
  },
});
