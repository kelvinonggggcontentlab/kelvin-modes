import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KELVIN REPRESENTATIVE by BLACKTOWER™" },
      {
        name: "description",
        content:
          "Telegram representative bot for Kelvin Ong of BLACKTOWER™ — replies in his own Malaysian Chinese and Manglish voice, from quick logistics to formal notices.",
      },
      { property: "og:title", content: "KELVIN REPRESENTATIVE by BLACKTOWER™" },
      {
        property: "og:description",
        content:
          "A Telegram bot that answers in Kelvin Ong's authentic voice — short and direct for daily logistics, structured and formal for business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const modes = [
  {
    tag: "MODE 00 · DEFAULT",
    name: "Secretary",
    body: "Speaks as the BLACKTOWER office secretary — screens the request, takes down the details, and passes it to Kelvin for confirmation. Commits to nothing on his behalf.",
    sample: ["Noted, I'll pass it to Kelvin", "May I have your company?", "/secretary"],
  },
  {
    tag: "MODE 01",
    name: "Casual / Logistics",
    body: "Ultra-short bursts. Timing, food, scheduling, confirmations.",
    sample: ["ok", "多一下", "好了跟我说"],
  },
  {
    tag: "MODE 02",
    name: "Direct",
    body: "Vague message in, concrete question out. No diplomatic cushioning.",
    sample: ["说重点", "ETA?", "which one, give me the number"],
  },
  {
    tag: "MODE 03",
    name: "Formal / Business",
    body: "Numbered structure, airtight logic, proper English or formal Chinese.",
    sample: ["Notice", "Proposal", "Review summary"],
  },
];

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-accent">
          Blacktower™ / Nexus
        </p>

        <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
          KELVIN
          <br />
          <span className="text-muted-foreground">REPRESENTATIVE</span>
        </h1>

        <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground">
          A Telegram bot that answers in Kelvin Ong's own voice — Malaysian Chinese blended with
          Johor Manglish. Short and blunt for daily coordination, structured and formal when the
          matter is business.
        </p>

        <div className="mt-14 space-y-px overflow-hidden rounded-lg border border-border">
          {modes.map((m) => (
            <section key={m.tag} className="bg-card px-6 py-7">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-[10px] tracking-[0.25em] text-accent">{m.tag}</span>
                <h2 className="font-display text-xl tracking-tight">{m.name}</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {m.sample.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border px-3 py-1 font-mono text-xs text-foreground/80"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-lg border border-border bg-secondary px-6 py-7">
          <h2 className="font-display text-lg tracking-tight">Live on Telegram</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Send <span className="font-mono text-foreground">/start</span> to begin. The bot opens
            in secretary mode; switch with{" "}
            <span className="font-mono text-foreground">/secretary</span> or{" "}
            <span className="font-mono text-foreground">/kelvin</span>, check with{" "}
            <span className="font-mono text-foreground">/mode</span>, and clear context with{" "}
            <span className="font-mono text-foreground">/reset</span>.
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card px-6 py-7">
          <h2 className="font-display text-lg tracking-tight">Assistant access (MCP)</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            AI assistants such as Claude or ChatGPT can connect to this app's tools — inspect handled
            chats, switch a chat's voice, or draft a reply. Callers sign in first, and chat data stays
            restricted to the operator account.
          </p>
          <a
            href="/auth"
            className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Operator sign in
          </a>
        </div>

        <footer className="mt-16 border-t border-border pt-6 font-mono text-[11px] leading-relaxed tracking-wide text-muted-foreground">
          Voice representation only. No personal profiling, no health or private-history handling, no
          disciplinary or access decisions.
        </footer>
      </div>
    </main>
  );
}
