import { formatPriceParts } from "@/lib/money";

// Amazon-style price with a small superscript dollar sign and cents.
export function Price({
  cents,
  className = "",
  size = "md",
}: {
  cents: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { whole, frac } = formatPriceParts(cents);
  const whole_cls =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl";
  const sup_cls = size === "lg" ? "text-base" : "text-xs";
  return (
    <span className={`text-amz-price ${className}`}>
      <span className={`${sup_cls} align-top`}>$</span>
      <span className={`${whole_cls} font-medium`}>{whole}</span>
      <span className={`${sup_cls} align-top`}>{frac}</span>
    </span>
  );
}
