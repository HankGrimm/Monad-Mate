/** Small formatting helpers shared across screens. */

const SCENE_LABELS: Record<string, string> = {
  dining: "Grab a meal",
  entertainment: "Play something",
  shopping: "Shop together",
};

const SCENE_ICONS: Record<string, string> = {
  dining: "ramen_dining",
  entertainment: "sports_esports",
  shopping: "shopping_bag",
};

const VENUE_ICONS: Record<string, string> = {
  mall: "storefront",
  supermarket: "local_grocery_store",
};

export function sceneLabel(scene: string | null | undefined): string {
  if (!scene) return "Meetup";
  return SCENE_LABELS[scene] ?? scene;
}

export function sceneIcon(scene: string | null | undefined): string {
  if (!scene) return "group";
  return SCENE_ICONS[scene] ?? "group";
}

export function venueIcon(venueType: string | null | undefined): string {
  if (!venueType) return "place";
  return VENUE_ICONS[venueType] ?? "place";
}

/** "7:00 PM" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "7:00 PM – 8:00 PM" */
export function formatWindow(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

/** "Oct 24, 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Relative countdown to a window opening, e.g. "Starts in 45 minutes".
 * Returns null once the window has already opened, so callers can hide the pill
 * rather than show a negative duration.
 */
export function startsIn(iso: string): string | null {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return null;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `Starts in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `Starts in ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Deterministic gradient pair from an id, so avatars stay stable per user. */
export function avatarGradient(seed: string): string {
  const gradients = [
    "from-primary-container to-secondary-container",
    "from-secondary-container to-primary-container",
    "from-primary-container to-tertiary-container",
    "from-tertiary-container to-primary-container",
    "from-inverse-primary to-secondary-container",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return gradients[hash % gradients.length];
}

export function initial(name: string | null | undefined, fallback = "?"): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return trimmed[0].toUpperCase();
}

/** Truncate a wallet address for display: 0x8F42...3e9 */
export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-3)}`;
}
