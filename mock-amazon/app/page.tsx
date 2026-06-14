import { PRODUCTS } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

// Landing page: a hero strip + the product grid. Fully server-rendered for
// agent readability; the only interactivity is the per-card "Add to Cart" island.
export default function HomePage() {
  return (
    <div data-testid="home-page">
      {/* Hero / deals banner */}
      <section
        aria-label="Featured deals"
        className="mb-4 rounded-md bg-gradient-to-r from-[#232f3e] to-[#37475a] px-6 py-8 text-white"
      >
        <h1 className="text-2xl font-bold sm:text-3xl">
          Today&apos;s Deals at Jamazon
        </h1>
      </section>

      <h2 className="mb-3 text-lg font-bold text-[#0f1111]">Recommended for you</h2>

      <section
        aria-label="Product grid"
        data-testid="product-grid"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {PRODUCTS.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </div>
  );
}
