"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { dict, type Lang } from "./dict";

type LangContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  d: typeof dict.en;
};

const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  d: dict.en,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("mm-lang");
      if (saved === "zh" || saved === "en") setLangState(saved);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("mm-lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <LangContext.Provider value={{ lang, setLang, d: dict[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
