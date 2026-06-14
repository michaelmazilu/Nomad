import type { Product } from "@/lib/products";

// Placeholder product art: a colored tile with the product's emoji glyph. This
// mock ships NO real product photography or scraped Amazon assets (POC + legal
// constraint). Purely decorative — the product title is always rendered as text
// alongside, so the tile is aria-hidden.
export function ProductImage({
  product,
  className = "",
  size = "card",
}: {
  product: Product;
  className?: string;
  size?: "card" | "detail" | "thumb";
}) {
  const glyphSize =
    size === "detail" ? "text-8xl" : size === "thumb" ? "text-3xl" : "text-6xl";
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center rounded-md ${glyphSize} ${className}`}
      style={{ backgroundColor: `${product.accent}1a` }}
      data-testid="product-image"
    >
      <span style={{ filter: "saturate(1.1)" }}>{product.image}</span>
    </div>
  );
}
