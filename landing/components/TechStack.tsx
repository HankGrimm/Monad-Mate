"use client";

import { useLang } from "@/lib/i18n";

export default function TechStack() {
  const { d } = useLang();

  return (
    <section id="tech-stack" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-block text-sm font-medium text-violet-400 bg-brand-violet/10 border border-brand-violet/20 px-4 py-1.5 rounded-full mb-4">
            {d.techStack.badge}
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">
            {d.techStack.title1}{" "}
            <span className="text-gradient">{d.techStack.title2}</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {d.techStack.sections.map((section) => (
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
          {d.techStack.stats.map((stat) => (
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
