const STACK = [
  {
    category: "Blockchain",
    items: [
      { name: "Monad", desc: "EIP-191 wallet auth, escrow, event log, soulbound credentials" },
      { name: "Foundry", desc: "Escrow, event log, and SBT contracts with forge tests" },
      { name: "Hedera HCS", desc: "Immutable audit log for attestations" },
      { name: "Base (Coinbase)", desc: "x402 HTTP payment protocol" },
    ],
  },
  {
    category: "Backend",
    items: [
      { name: "FastAPI", desc: "30 service classes, 50+ endpoints" },
      { name: "SQLAlchemy 2.0", desc: "17 ORM models, PgBouncer connection pooling" },
      { name: "Celery + Redis", desc: "Deposit review, match expiry, credit refresh" },
      { name: "PostgreSQL", desc: "sm_ prefixed schema, full pytest suite" },
    ],
  },
  {
    category: "AI / Infra",
    items: [
      { name: "llama-3.3-70b", desc: "Icebreakers and short plans via AINative" },
      { name: "ZeroDB", desc: "768-dim BAAI/bge vectors for preference matching" },
      { name: "Hedera HCS", desc: "Tamper-proof audit log for safety decisions" },
      { name: "AINative Studio", desc: "LLM inference + embedding API" },
    ],
  },
  {
    category: "Mobile / DApp",
    items: [
      { name: "Progressive Web App", desc: "Add to Home Screen, installable on any mobile browser" },
      { name: "Managed accounts", desc: "Email or phone login, no seed phrase or gas" },
      { name: "MetaMask / Rabby", desc: "Self-custody sign-in for wallet users" },
      { name: "x402 Protocol", desc: "USDC payment gate on Base" },
    ],
  },
];

export default function TechStack() {
  return (
    <section id="tech-stack" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-block text-sm font-medium text-violet-400 bg-brand-violet/10 border border-brand-violet/20 px-4 py-1.5 rounded-full mb-4">
            Tech Stack
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">
            Multi-chain by design.{" "}
            <span className="text-gradient">Accountable by default.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STACK.map((section) => (
            <div key={section.category}>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
                {section.category}
              </h3>
              <div className="flex flex-col gap-3">
                {section.items.map((item) => (
                  <div
                    key={item.name}
                    className="p-4 rounded-xl bg-brand-card border border-brand-border hover:border-brand-violet/40 transition-colors"
                  >
                    <div className="font-semibold text-sm mb-1">{item.name}</div>
                    <div className="text-xs text-white/45 leading-relaxed">
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Live stats bar */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: "451", label: "Tests passing", sub: "backend suite" },
            { value: "50+", label: "API endpoints", sub: "12 domains" },
            { value: "30", label: "Service classes", sub: "fully tested" },
            { value: "3", label: "Solidity contracts", sub: "ready for Monad testnet" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="text-center p-6 rounded-2xl bg-brand-card border border-brand-border"
            >
              <div className="text-3xl font-black text-gradient mb-1">
                {stat.value}
              </div>
              <div className="text-sm font-medium">{stat.label}</div>
              <div className="text-xs text-white/40 mt-1">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
