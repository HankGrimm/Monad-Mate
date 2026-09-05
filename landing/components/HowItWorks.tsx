"use client";

import { useLang } from "@/lib/i18n";

export default function HowItWorks() {
  const { d } = useLang();

  return (
    <section
      id="how-it-works"
      className="py-24 px-6 max-w-6xl mx-auto"
    >
      <div className="text-center mb-16">
        <div className="inline-block text-sm font-medium text-violet-400 bg-brand-violet/10 border border-brand-violet/20 px-4 py-1.5 rounded-full mb-4">
          {d.howItWorks.badge}
        </div>
        <h2 className="text-4xl md:text-5xl font-black tracking-tight">
          {d.howItWorks.title1}{" "}
          <span className="text-gradient">{d.howItWorks.title2}</span>
        </h2>
        <p className="mt-4 text-white/50 max-w-xl mx-auto text-lg">
          {d.howItWorks.sub}
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {d.howItWorks.steps.map((step) => (
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
