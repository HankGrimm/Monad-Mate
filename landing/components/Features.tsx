const FEATURES = [
  {
    icon: "📍",
    title: "Same Venue, Same Hour",
    desc: "Requests are anchored to a specific mall or supermarket and a time window. Candidates must share the venue, the window, and the intent — no cross-city feed padding, and an empty result stays empty.",
    tags: ["Venue-Scoped", "Time Window", "Scene Match"],
    color: "violet",
  },
  {
    icon: "🤖",
    title: "AI Match Agent",
    desc: "Preference embeddings plus follow-through history, habit overlap, window fit, and safety signals. Every candidate ships with the reasons it surfaced, so the ranking is explainable.",
    tags: ["Vector Similarity", "Explainable", "Habit Affinity"],
    color: "purple",
  },
  {
    icon: "📱",
    title: "No Seed Phrase Needed",
    desc: "Email or phone login provisions a managed account — no key management, no gas prompts. Link an external wallet later to take full self-custody whenever you want.",
    tags: ["Managed Wallet", "Gas Sponsored", "Self-Custody Path"],
    color: "pink",
  },
  {
    icon: "💰",
    title: "Commitment Deposit",
    desc: "A fixed MON deposit held in the escrow contract, returned once both sides check in. It binds your own attendance — betting on someone else's behaviour is explicitly out of scope.",
    tags: ["Monad Escrow", "Native MON", "Auto-Refund"],
    color: "coral",
  },
  {
    icon: "🛡️",
    title: "Safety Preferences",
    desc: "Same-gender-only, verified-only, and minimum-reputation filters are hard constraints applied in both directions — a candidate failing them is never shown, not merely ranked lower.",
    tags: ["Hard Filters", "Bidirectional", "Verification Gate"],
    color: "violet",
  },
  {
    icon: "🎖️",
    title: "Soulbound Credentials",
    desc: "Each completed meetup mints a non-transferable credential holding the venue category, scene, time, and outcome. No counterparty identity is ever written on-chain.",
    tags: ["Soulbound", "Privacy-Safe", "Correctable"],
    color: "purple",
  },
  {
    icon: "📊",
    title: "Follow-Through Credit",
    desc: "Credit is built from real attendance records and stays hidden until enough history exists. It describes past follow-through only — never a personal-safety guarantee.",
    tags: ["History-Based", "No Leaderboard", "Disclosed Limits"],
    color: "pink",
  },
  {
    icon: "🚨",
    title: "Reports & Arbitration",
    desc: "Six report categories, repeat-offender detection, and bidirectional blocks. A one-sided claim never auto-convicts — unmatched check-ins go to review instead of an instant penalty.",
    tags: ["Moderation", "Review Queue", "Bidirectional Block"],
    color: "coral",
  },
];

const colorMap: Record<string, string> = {
  violet: "bg-brand-violet/10 text-violet-300 border-brand-violet/20",
  purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  pink: "bg-brand-pink/10 text-pink-300 border-brand-pink/20",
  coral: "bg-orange-500/10 text-orange-300 border-orange-500/20",
};

export default function Features() {
  return (
    <section id="features" className="py-24 px-6 bg-brand-dark/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-block text-sm font-medium text-pink-400 bg-brand-pink/10 border border-brand-pink/20 px-4 py-1.5 rounded-full mb-4">
            Features
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">
            Built for the hour{" "}
            <span className="text-gradient">you're actually free.</span>
          </h2>
          <p className="mt-4 text-white/50 max-w-xl mx-auto text-lg">
            Every feature exists to close one gap: matching strangers who are in
            the same place right now, and making sure they both show up.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-5 rounded-2xl border-gradient bg-brand-card hover:scale-[1.02] transition-transform duration-200 cursor-default"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold mb-2">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed mb-4">
                {f.desc}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {f.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`text-xs px-2 py-0.5 rounded-full border ${colorMap[f.color]}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
