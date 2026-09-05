"use client";

import { useLang } from "@/lib/i18n";

const GITHUB_URL = "https://github.com/HankGrimm/monad-mate-trust-api";
const API_URL = "/api";

export default function Hero() {
  const { d } = useLang();

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-16 overflow-hidden bg-hero-gradient">
      {/* Background orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-violet/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-brand-pink/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-violet/5 rounded-full blur-3xl pointer-events-none" />



      {/* Headline */}
      <h1 className="relative text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6 max-w-4xl">
        {d.hero.headline1}
        <br />
        <span className="text-gradient">{d.hero.headline2}</span>
      </h1>

      {/* Subheadline */}
      <p className="relative text-lg md:text-xl text-white/60 max-w-2xl mb-10 leading-relaxed">
        {d.hero.sub}
      </p>

      {/* Social proof chips */}
      <div className="relative flex flex-wrap justify-center gap-3 mb-10 text-sm">
        {d.hero.chips.map((chip) => (
          <span
            key={chip.label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70"
          >
            <span>{chip.icon}</span>
            {chip.label}
          </span>
        ))}
      </div>

      {/* Primary CTAs */}
      <div className="relative flex flex-col sm:flex-row items-center gap-4 mb-16">
        <a
          href="/app"
          className="px-8 py-4 rounded-full bg-cta-gradient text-white font-semibold text-lg hover:opacity-90 transition-opacity glow-violet"
        >
          {d.hero.ctaApp}
        </a>
        <a
          href={API_URL + "/docs"}
          target="_blank"
          rel="noopener noreferrer"
          className="px-8 py-4 rounded-full border border-brand-violet/50 text-white/80 font-semibold text-lg hover:border-brand-violet hover:text-white transition-all"
        >
          {d.hero.ctaDocs}
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-8 py-4 rounded-full border border-white/20 text-white/60 font-semibold text-lg hover:text-white hover:border-white/40 transition-all"
        >
          {d.hero.ctaOpen}
        </a>
      </div>

      {/* Mock phone mockup */}
      <div className="relative w-64 h-auto animate-float">
        <div className="w-64 h-[540px] rounded-[40px] bg-brand-card border-2 border-brand-violet/40 shadow-2xl glow-violet overflow-hidden flex flex-col">
          {/* Phone status bar */}
          <div className="h-8 bg-brand-dark/80 flex items-center justify-between px-6 text-xs text-white/40">
            <span>9:41</span>
            <span>●●●</span>
          </div>
          {/* App header */}
          <div className="px-5 pt-4 pb-3 border-b border-brand-border">
            <div className="flex items-center gap-2">
              <span className="text-xl">💜</span>
              <span className="font-bold text-sm text-gradient">MonadMate</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                LIVE
              </span>
            </div>
            <div className="mt-2 text-[11px] text-white/40">
              {d.hero.phone.location}
            </div>
          </div>
          {/* Match card */}
          <div className="m-4 p-4 rounded-2xl bg-card-gradient border border-brand-violet/20">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-lg font-bold">
                L
              </div>
              <div>
                <div className="font-semibold text-sm">{d.hero.phone.name}</div>
                <div className="text-xs text-white/50">
                  {d.hero.phone.match}
                </div>
              </div>
            </div>
            <div className="text-xs text-white/60 leading-relaxed mb-3">
              {d.hero.phone.quote}
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-xl bg-brand-violet/20 border border-brand-violet/40 text-xs text-violet-300 font-medium">
                {d.hero.phone.pass}
              </button>
              <button className="flex-1 py-2 rounded-xl bg-cta-gradient text-white text-xs font-semibold">
                {d.hero.phone.letsGo}
              </button>
            </div>
          </div>
          {/* Stake status */}
          <div className="mx-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/50 mb-1">
              {d.hero.phone.depositLabel}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-green-400">0.50 MON</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                {d.hero.phone.refundNote}
              </span>
            </div>
          </div>
          {/* Bottom nav */}
          <div className="mt-auto border-t border-brand-border px-6 py-3 flex justify-around text-white/40">
            <span className="text-lg">🏠</span>
            <span className="text-lg">💬</span>
            <span className="text-lg">⭐</span>
            <span className="text-lg">👤</span>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/30">
        <svg
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}
