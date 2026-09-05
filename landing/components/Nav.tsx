"use client";
import { useState, useEffect } from "react";
import { useLang } from "@/lib/i18n";

const NAV_HREFS = ["#how-it-works", "#features", "#tech-stack", "#open-source"];

const API_URL = "/api";
const GITHUB_URL = "https://github.com/HankGrimm/monad-mate-trust-api";

export default function Nav() {
  const { lang, setLang, d } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const toggleLang = () => setLang(lang === "en" ? "zh" : "en");

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-brand-dark/90 backdrop-blur-md border-b border-brand-border"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2">
          <span className="text-2xl">💜</span>
          {lang === "zh" ? (
            <span className="font-bold text-lg tracking-tight">
              你<span className="text-gradient">鸽了吗</span>
            </span>
          ) : (
            <span className="font-bold text-lg tracking-tight">
              Monad<span className="text-gradient">Mate</span>
            </span>
          )}
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {d.nav.links.map((label, i) => (
            <a
              key={NAV_HREFS[i]}
              href={NAV_HREFS[i]}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              {label}
            </a>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-3">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="text-xs px-3 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all font-semibold tracking-wide"
            aria-label="Toggle language / 切换语言"
          >
            {lang === "en" ? "中文" : "EN"}
          </button>
          <a
            href={API_URL + "/docs"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            {d.nav.apiDocs}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-4 py-2 rounded-full border border-brand-violet/50 text-white/80 hover:border-brand-violet hover:text-white transition-all"
          >
            GitHub
          </a>
          <a
            href="/app"
            className="text-sm px-4 py-2 rounded-full bg-cta-gradient text-white font-medium hover:opacity-90 transition-opacity"
          >
            {d.nav.getTheApp}
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white/70"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {menuOpen ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-brand-card/95 backdrop-blur-md border-t border-brand-border px-6 py-4 flex flex-col gap-4">
          <button
            onClick={toggleLang}
            className="text-sm px-4 py-2 rounded-full border border-white/20 text-white/80 self-start font-semibold"
          >
            {lang === "en" ? "切换中文" : "Switch to EN"}
          </button>
          {d.nav.links.map((label, i) => (
            <a
              key={NAV_HREFS[i]}
              href={NAV_HREFS[i]}
              onClick={() => setMenuOpen(false)}
              className="text-white/70 hover:text-white transition-colors"
            >
              {label}
            </a>
          ))}
          <a
            href="/app"
            onClick={() => setMenuOpen(false)}
            className="px-4 py-2 rounded-full bg-cta-gradient text-white font-medium text-center"
          >
            {d.nav.getTheApp}
          </a>
        </div>
      )}
    </nav>
  );
}
