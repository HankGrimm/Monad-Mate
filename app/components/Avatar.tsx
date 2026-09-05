import { avatarGradient, initial } from "@/lib/format";
import Icon from "./Icon";

type Ring = "none" | "verified" | "pending" | "brand";

const RING_CLASSES: Record<Ring, string> = {
  none: "bg-surface-container-highest",
  verified: "bg-tertiary shadow-onsite",
  pending: "bg-primary-container shadow-beacon animate-pulse",
  brand: "bg-gradient-to-tr from-primary-container via-secondary to-tertiary shadow-beacon",
};

/**
 * Initial-based avatar with a deterministic gradient.
 *
 * The Stitch export referenced `lh3.googleusercontent.com` placeholder photos.
 * Those URLs are tied to the generation session and will 404 later, so real
 * avatars are rendered from the display name instead — no external image
 * dependency, and no broken images once the export expires.
 */
export default function Avatar({
  name,
  seed,
  size = 64,
  ring = "none",
  badge,
}: {
  name?: string | null;
  seed?: string;
  size?: number;
  ring?: Ring;
  badge?: "check" | "pending" | "verified";
}) {
  const gradient = avatarGradient(seed ?? name ?? "monadmate");
  const ringWidth = ring === "none" ? 0 : 2;
  const inner = size - ringWidth * 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`w-full h-full rounded-full ${RING_CLASSES[ring]} flex items-center justify-center`}
        style={{ padding: ringWidth }}
      >
        <div
          className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-on-primary-container font-bold`}
          style={{ width: inner, height: inner, fontSize: inner * 0.4 }}
        >
          {initial(name)}
        </div>
      </div>

      {badge === "check" && (
        <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center shadow-onsite">
          <Icon name="check" size={16} />
        </div>
      )}
      {badge === "pending" && (
        <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-surface-container-highest text-primary flex items-center justify-center">
          <Icon name="progress_activity" size={15} className="animate-spin" />
        </div>
      )}
      {badge === "verified" && (
        <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-surface-container-lowest flex items-center justify-center p-0.5">
          <div className="w-full h-full rounded-full bg-tertiary flex items-center justify-center shadow-onsite">
            <Icon name="check" size={14} filled className="text-on-tertiary" />
          </div>
        </div>
      )}
    </div>
  );
}
