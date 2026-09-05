"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { GlassButton, GradientButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import { ErrorBanner, ScreenLoader, SuccessBanner } from "@/components/States";
import { api, ApiError, preferences as prefsApi } from "@/lib/api";
import type { User } from "@/lib/types";

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISTP", "ESTJ", "ESTP",
  "ISFJ", "ISFP", "ESFJ", "ESFP",
];

const INTEREST_OPTIONS = [
  "hotpot", "coffee", "ramen", "dessert", "cocktails",
  "gaming", "board games", "arcade", "karaoke", "bowling",
  "art", "photography", "design", "music", "film",
  "tech", "startups", "crypto", "travel", "hiking",
  "fitness", "yoga", "reading", "anime", "fashion",
];

const TRAIT_OPTIONS = [
  "adventurous", "creative", "ambitious", "empathetic", "humorous",
  "introverted", "extroverted", "caring", "intellectual", "spiritual",
  "optimistic", "spontaneous", "reliable", "passionate", "laid-back",
];

export default function PreferencesPage() {
  return <RequireAuth>{(user) => <Preferences user={user} />}</RequireAuth>;
}

function Preferences({ user }: { user: User }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Form state
  const [birthDate, setBirthDate] = useState("");
  const [mbti, setMbti] = useState("");
  const [sleepSchedule, setSleepSchedule] = useState("");
  const [occupation, setOccupation] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [education, setEducation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [traits, setTraits] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const prefs = await prefsApi.get();
      if (prefs) {
        setBirthDate(prefs.birth_date ?? "");
        setMbti(prefs.mbti ?? "");
        setSleepSchedule(prefs.sleep_schedule ?? "");
        setOccupation(prefs.occupation ?? "");
        setIndustry(prefs.industry ?? "");
        setCity(prefs.city ?? "");
        setEducation(prefs.education ?? "");
        setInterests(prefs.interests ?? []);
        setTraits(prefs.personality_traits ?? []);
      }
    } catch (err) {
      // A 404 or null just means no preferences yet — not an error state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(list: string[], item: string, setList: (v: string[]) => void) {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await prefsApi.update({
        birth_date: birthDate || undefined,
        mbti: mbti || undefined,
        sleep_schedule: sleepSchedule || undefined,
        occupation: occupation || undefined,
        industry: industry || undefined,
        city: city || undefined,
        education: education || undefined,
        interests: interests.length > 0 ? interests : undefined,
        personality_traits: traits.length > 0 ? traits : undefined,
      });
      setNotice("Preferences saved. Matching will use these from now on.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <AppHeader title="Preferences" back />
        <main className="flex flex-1 flex-col px-gutter-mobile pt-20">
          <ScreenLoader label="Loading your preferences" />
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Preferences" back />
      <main className="flex flex-1 flex-col gap-space-lg px-gutter-mobile pb-space-3xl pt-20">
        {error && <ErrorBanner message={error} />}
        {notice && <SuccessBanner message={notice} />}

        <p className="px-space-2xs text-body-md text-on-surface-variant">
          These feed the matchmaker. Fill in what you&apos;re comfortable sharing —
          anything left blank just doesn&apos;t contribute to your score.
        </p>

        {/* Persona dimensions */}
        <section className="flex flex-col gap-space-md rounded-lg bg-surface-container p-space-lg shadow-float">
          <SectionTitle icon="auto_awesome" text="About you" />

          <Field label="Birth date" hint="Used to derive your star sign and Chinese zodiac">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="MBTI" hint="16-type personality indicator">
            <div className="flex flex-wrap gap-space-2xs">
              {MBTI_TYPES.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={mbti === t}
                  onClick={() => setMbti(mbti === t ? "" : t)}
                />
              ))}
            </div>
          </Field>

          <Field label="Sleep schedule" hint="Affects time-slot compatibility">
            <div className="flex gap-space-xs">
              {(["early", "flexible", "night"] as const).map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={sleepSchedule === s}
                  onClick={() => setSleepSchedule(sleepSchedule === s ? "" : s)}
                  full
                />
              ))}
            </div>
          </Field>
        </section>

        {/* Realistic dimensions */}
        <section className="flex flex-col gap-space-md rounded-lg bg-surface-container p-space-lg shadow-float">
          <SectionTitle icon="work" text="Background" />

          <Field label="Occupation">
            <input
              type="text"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="e.g. Designer"
              className={inputClass}
            />
          </Field>

          <Field label="Industry">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Tech, Fashion, Finance"
              className={inputClass}
            />
          </Field>

          <Field label="City">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Beijing"
              className={inputClass}
            />
          </Field>

          <Field label="Education">
            <div className="flex flex-wrap gap-space-2xs">
              {(["high school", "bachelor", "master", "phd", "other"].map((e) => (
                <Chip
                  key={e}
                  label={e}
                  active={education === e}
                  onClick={() => setEducation(education === e ? "" : e)}
                />
              )))}
            </div>
          </Field>
        </section>

        {/* Interests */}
        <section className="flex flex-col gap-space-md rounded-lg bg-surface-container p-space-lg shadow-float">
          <SectionTitle icon="interests" text="Interests" />
          <p className="text-body-sm text-on-surface-variant">
            Pick what you&apos;re actually into — shared interests lead the icebreakers.
          </p>
          <div className="flex flex-wrap gap-space-2xs">
            {INTEREST_OPTIONS.map((item) => (
              <Chip
                key={item}
                label={item}
                active={interests.includes(item)}
                onClick={() => toggle(interests, item, setInterests)}
              />
            ))}
          </div>
          {interests.length > 0 && (
            <p className="text-body-sm text-outline">{interests.length} selected</p>
          )}
        </section>

        {/* Personality traits */}
        <section className="flex flex-col gap-space-md rounded-lg bg-surface-container p-space-lg shadow-float">
          <SectionTitle icon="psychology" text="Personality" />
          <div className="flex flex-wrap gap-space-2xs">
            {TRAIT_OPTIONS.map((item) => (
              <Chip
                key={item}
                label={item}
                active={traits.includes(item)}
                onClick={() => toggle(traits, item, setTraits)}
              />
            ))}
          </div>
        </section>

        <div className="mt-auto flex flex-col gap-space-sm pt-space-md">
          <GradientButton onClick={save} loading={saving} icon="save">
            Save preferences
          </GradientButton>
          <GlassButton onClick={() => router.push("/")} icon="radar">
            Find someone now
          </GlassButton>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const inputClass =
  "h-[50px] rounded border border-surface-container-high bg-surface-container-low px-space-md text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] focus:outline-none";

function SectionTitle({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="flex items-center gap-space-xs text-label-sm uppercase tracking-wider text-on-surface-variant">
      <Icon name={icon} size={16} />
      {text}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-space-2xs">
      <div className="flex items-baseline justify-between">
        <span className="text-label-md text-on-surface">{label}</span>
        {hint && <span className="text-body-sm text-outline">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  full = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-full px-space-md text-label-md capitalize transition-all active:scale-95 ${
        full ? "flex-1" : ""
      } ${
        active
          ? "bg-primary-container text-white shadow-beacon"
          : "bg-surface-container-low text-on-surface-variant"
      }`}
    >
      {label}
    </button>
  );
}
