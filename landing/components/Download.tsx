"use client";

import { useLang } from "@/lib/i18n";

const GITHUB_URL = "https://github.com/HankGrimm/monad-mate-trust-api";

export default function Download() {
  const { d } = useLang();

  return (
    <section
      id="download"
      className="py-24 px-6 bg-gradient-to-b from-transparent to-brand-card/30"
    >
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-block text-sm font-medium text-pink-400 bg-brand-pink/10 border border-brand-pink/20 px-4 py-1.5 rounded-full mb-6">
          {d.download.badge}
        </div>
        <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
          {d.download.title1}{" "}
          <span className="text-gradient">{d.download.title2}</span>
        </h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto mb-12">
          {d.download.sub}
        </p>

        <div className="grid sm:grid-cols-3 gap-6 mb-12">
          {/* Option 1: Web dApp */}
          <div className="p-6 rounded-2xl border-gradient bg-brand-card flex flex-col items-center gap-4 hover:glow-violet transition-all">
            <div className="text-4xl">🌐</div>
            <h3 className="font-bold text-lg">{d.download.webTitle}</h3>
            <p className="text-white/50 text-sm text-center">
              {d.download.webDesc}
            </p>
            <a
              href="/app"
              className="mt-auto w-full py-3 rounded-xl bg-cta-gradient text-white font-semibold text-sm text-center hover:opacity-90 transition-opacity"
            >
              {d.download.webBtn}
            </a>
          </div>

          {/* Option 2: Android APK sideload */}
          <div className="p-6 rounded-2xl border border-brand-violet/30 bg-brand-card/50 flex flex-col items-center gap-4 relative overflow-hidden">
            <div className="absolute top-3 right-3 text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              {d.download.apkSoon}
            </div>
            <div className="text-4xl">📱</div>
            <h3 className="font-bold text-lg">{d.download.apkTitle}</h3>
            <p className="text-white/50 text-sm text-center">
              {d.download.apkDesc}
            </p>
            <div className="mt-auto w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 font-semibold text-sm text-center cursor-not-allowed">
              {d.download.apkBtn}
            </div>
          </div>

          {/* Option 3: PWA / Add to Home Screen */}
          <div className="p-6 rounded-2xl border-gradient bg-brand-card flex flex-col items-center gap-4 hover:glow-violet transition-all">
            <div className="text-4xl">💾</div>
            <h3 className="font-bold text-lg">{d.download.pwaTitle}</h3>
            <p className="text-white/50 text-sm text-center">
              {d.download.pwaDesc}
            </p>
            <a
              href="/app"
              className="mt-auto w-full py-3 rounded-xl border border-brand-violet/50 text-white/80 font-semibold text-sm text-center hover:border-brand-violet hover:text-white transition-all"
            >
              {d.download.pwaBtn}
            </a>
          </div>
        </div>

        {/* Wallet compatibility */}
        <div className="p-6 rounded-2xl bg-brand-card/50 border border-brand-border inline-block">
          <div className="text-sm text-white/50 mb-3">
            {d.download.compatTitle}
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            {d.download.compat.map((w) => (
              <span key={w} className="text-white/70">
                {w}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
