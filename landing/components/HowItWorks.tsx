const STEPS = [
  {
    n: "01",
    icon: "📱",
    title: "Sign In, No Seed Phrase",
    desc: "Log in with your email or phone. Monad Mate provisions a managed account for you — no seed phrase, no gas prompts. Bring your own MetaMask or Rabby instead if you'd rather self-custody.",
  },
  {
    n: "02",
    icon: "📍",
    title: "Post What You Want, Right Now",
    desc: "Pick the mall or supermarket you're standing in, choose a scene — a meal, an arcade round, a shopping run — and set how long you've got. Matching is limited to that venue and that time window.",
  },
  {
    n: "03",
    icon: "🤖",
    title: "AI Surfaces Who's Actually Nearby",
    desc: "The match agent ranks people at the same venue with an overlapping window and the same intent, factoring shared interests, follow-through history, and safety preferences. Every suggestion comes with a reason.",
  },
  {
    n: "04",
    icon: "🤝",
    title: "Both Sides Confirm",
    desc: "You see verification status and past follow-through before deciding. Either side can pass with no penalty. Only a mutual yes forms a team.",
  },
  {
    n: "05",
    icon: "💰",
    title: "Commit a Small Deposit",
    desc: "Both parties put up a fixed MON deposit through the escrow contract. It's a commitment to your own attendance — not a bet on whether the other person shows.",
  },
  {
    n: "06",
    icon: "⭐",
    title: "Meet, Check In, Earn a Credential",
    desc: "Confirm the meetup with GPS or a QR scan. Deposits return automatically, and a soulbound credential records the venue type, scene, and that you kept your word — never who you met.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-24 px-6 max-w-6xl mx-auto"
    >
      <div className="text-center mb-16">
        <div className="inline-block text-sm font-medium text-violet-400 bg-brand-violet/10 border border-brand-violet/20 px-4 py-1.5 rounded-full mb-4">
          How It Works
        </div>
        <h2 className="text-4xl md:text-5xl font-black tracking-tight">
          From standing alone in a mall{" "}
          <span className="text-gradient">to actually doing something.</span>
        </h2>
        <p className="mt-4 text-white/50 max-w-xl mx-auto text-lg">
          Matching is the easy half. Monad Mate also plans the first hour and
          makes showing up mean something.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="relative p-6 rounded-2xl border-gradient bg-brand-card hover:glow-violet transition-all duration-300 group"
          >
            <div className="absolute top-4 right-4 text-4xl font-black text-white/5 group-hover:text-white/10 transition-colors select-none">
              {step.n}
            </div>
            <div className="text-3xl mb-4">{step.icon}</div>
            <h3 className="font-bold text-lg mb-2">{step.title}</h3>
            <p className="text-white/55 text-sm leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
