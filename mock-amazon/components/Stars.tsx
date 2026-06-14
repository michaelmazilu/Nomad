// Static star-rating row (Amazon orange). Rating is decorative catalog data.
export function Stars({
  rating,
  count,
  className = "",
}: {
  rating: number;
  count?: number;
  className?: string;
}) {
  const rounded = Math.round(rating * 2) / 2; // nearest half
  const full = Math.floor(rounded);
  const half = rounded - full === 0.5;
  const label = `${rating.toFixed(1)} out of 5 stars`;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        className="text-[#de7921] leading-none"
        role="img"
        aria-label={label}
        title={label}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const char = i < full ? "★" : i === full && half ? "⯨" : "☆";
          return <span key={i} aria-hidden="true">{char}</span>;
        })}
      </span>
      {count != null && (
        <span className="text-xs text-amz-link">
          {count.toLocaleString("en-US")}
        </span>
      )}
    </span>
  );
}
