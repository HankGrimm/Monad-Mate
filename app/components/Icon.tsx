/**
 * Material Symbols glyph wrapper.
 *
 * The design leans on Material Symbols throughout; `filled` maps to the
 * variable font's FILL axis rather than a separate icon set.
 */
export default function Icon({
  name,
  size = 20,
  filled = false,
  className = "",
}: {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined leading-none ${
        filled ? "icon-filled" : ""
      } ${className}`}
      style={{ fontSize: `${size}px` }}
    >
      {name}
    </span>
  );
}
