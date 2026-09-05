"use client";

import { useLang } from "@/lib/i18n";

const colorMap: Record<string, string> = {
  violet: "bg-brand-violet/10 text-violet-300 border-brand-violet/20",
  purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  pink: "bg-brand-pink/10 text-pink-300 border-brand-pink/20",
  coral: "bg-orange-500/10 text-orange-300 border-orange-500/20",
};

export default function Features() {
  const { d } = useLang();

  return (
    <section id="features" className="py-24 px-6 bg-brand-dark/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-block text-sm font-medium text-pink-400 bg-brand-pink/10 border border-brand-pink/20 px-4 py-1.5 rounded-full mb-4">
            {d.features.badge}
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">
            {d.features.title1}{" "}
            <span className="text-gradient">{d.features.title2}</span>
          </h2>
          <p className="mt-4 text-white/50 max-w-xl mx-auto text-lg">
            {d.features.sub}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {d.features.items.map((f) => (
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
