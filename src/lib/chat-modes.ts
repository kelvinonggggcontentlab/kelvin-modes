/** Voices available in the in-app BLACKTOWER chat. Client-safe metadata only. */
export const CHAT_MODES = ["tower", "secretary", "kelvin", "nexus"] as const;

export type ChatMode = (typeof CHAT_MODES)[number];

/** Database value for a voice. The `tower` voice is stored as `blacktower`. */
export function toDbMode(mode: ChatMode): string {
  return mode === "tower" ? "blacktower" : mode;
}

export function fromDbMode(value: unknown): ChatMode {
  if (value === "blacktower" || value === "tower") return "tower";
  if (value === "secretary" || value === "kelvin" || value === "nexus") return value;
  return "tower";
}

export const MODE_META: Record<ChatMode, { label: string; tag: string; blurb: string }> = {
  tower: {
    label: "TOWER",
    tag: "House desk",
    blurb: "The BLACKTOWER™ desk voice — drafts, plans, sanity checks. Composed, sparing 咯.",
  },
  secretary: {
    label: "SECRETARY",
    tag: "Gatekeeper",
    blurb: "Screens the request, takes the details, passes it to Kelvin. Commits to nothing.",
  },
  kelvin: {
    label: "KELVIN",
    tag: "Direct voice",
    blurb: "Kelvin's own register — 1-5 word bursts, sharp when the message is vague.",
  },
  nexus: {
    label: "NEXUS",
    tag: "Chatty",
    blurb: "Talkative trend-talker. Makan, bola, dramas, gadgets, JB–SG life.",
  },
};
