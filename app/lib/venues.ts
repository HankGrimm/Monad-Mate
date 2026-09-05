/**
 * Venue catalogue.
 *
 * The backend matches on a stable `venue_key`, which in production would come
 * from a POI provider (Amap/Google Places) resolved from the device's location.
 * No such integration exists yet, so this is a curated stand-in list — enough to
 * demo same-venue matching, and the shape the real lookup should return.
 */
import type { VenueType } from "./types";

export interface Venue {
  key: string;
  name: string;
  type: VenueType;
  /** Free-text zone shown under the venue name. */
  area: string;
  latitude: number;
  longitude: number;
}

export const VENUES: Venue[] = [
  {
    key: "mall-taikoo-li-sanlitun",
    name: "Taikoo Li Sanlitun",
    type: "mall",
    area: "Chaoyang, Beijing",
    latitude: 39.9337,
    longitude: 116.4547,
  },
  {
    key: "mall-k11-art",
    name: "K11 Art Mall",
    type: "mall",
    area: "Huangpu, Shanghai",
    latitude: 31.2286,
    longitude: 121.4692,
  },
  {
    key: "mall-raffles-city",
    name: "Raffles City",
    type: "mall",
    area: "Huangpu, Shanghai",
    latitude: 31.2331,
    longitude: 121.4737,
  },
  {
    key: "supermarket-sams-club",
    name: "Sam's Club",
    type: "supermarket",
    area: "Shunyi, Beijing",
    latitude: 40.0799,
    longitude: 116.6543,
  },
  {
    key: "supermarket-hema-x",
    name: "Hema Fresh X",
    type: "supermarket",
    area: "Pudong, Shanghai",
    latitude: 31.2222,
    longitude: 121.5439,
  },
];

export function findVenue(key: string): Venue | undefined {
  return VENUES.find((v) => v.key === key);
}

export const SCENES = [
  {
    value: "dining" as const,
    label: "Grab a meal",
    icon: "ramen_dining",
    hint: "Dinner, coffee, or a new spot",
  },
  {
    value: "entertainment" as const,
    label: "Play something",
    icon: "sports_esports",
    hint: "Arcade, board games, exhibits",
  },
  {
    value: "shopping" as const,
    label: "Shop together",
    icon: "shopping_bag",
    hint: "Browse, split a bulk buy",
  },
];

export const DURATIONS = [30, 60, 120];
