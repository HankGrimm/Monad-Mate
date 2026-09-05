import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import TechStack from "@/components/TechStack";
import Download from "@/components/Download";
import OpenSource from "@/components/OpenSource";
import Footer from "@/components/Footer";
import { LangProvider } from "@/lib/i18n";

export default function Home() {
  return (
    <main className="min-h-screen bg-brand-dark text-white overflow-x-hidden">
      <LangProvider>
        <Nav />
        <Hero />
        <HowItWorks />
        <Features />
        <TechStack />
        <Download />
        <OpenSource />
        <Footer />
      </LangProvider>
    </main>
  );
}
