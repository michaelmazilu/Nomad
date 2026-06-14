import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS, getProduct } from "@/lib/products";
import { ProductImage } from "@/components/ProductImage";
import { Stars } from "@/components/Stars";
import { Price } from "@/components/Price";
import { AddToCartButton } from "@/components/AddToCartButton";
import { BuyNowButton } from "@/components/BuyNowButton";
import { formatCents } from "@/lib/money";

// Pre-render every product page at build time (static, no backend).
export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();

  return (
    <div data-testid="product-detail" data-product-id={product.id}>
      <nav className="mb-3 text-xs text-amz-link" aria-label="Breadcrumb">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        <span className="text-gray-400">›</span> {product.category}
      </nav>

      <div className="grid grid-cols-1 gap-6 rounded-md bg-white p-4 md:grid-cols-12">
        {/* Image */}
        <div className="md:col-span-5">
          <ProductImage
            product={product}
            size="detail"
            className="h-72 w-full md:h-96"
          />
        </div>

        {/* Center: details */}
        <div className="md:col-span-4">
          <h1 className="text-xl font-medium text-[#0f1111]">{product.title}</h1>
          <p className="mt-1 text-xs text-amz-link">
            Visit the {product.brand} Store
          </p>
          <div className="mt-1 border-b border-gray-200 pb-2">
            <Stars rating={product.rating} count={product.ratingCount} />
          </div>

          <div className="mt-3">
            <Price cents={product.priceCents} size="lg" />
          </div>
          <p className="mt-1 text-sm text-gray-700">
            <span className="font-bold">FREE delivery</span> &amp; fast, free
            returns
          </p>

          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-[#0f1111]">
            {product.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        {/* Right: buy box */}
        <aside
          className="md:col-span-3"
          aria-label="Purchase options"
          data-testid="buy-box"
        >
          <div className="rounded-md border border-gray-300 p-4">
            <Price cents={product.priceCents} />
            <p className="mt-2 text-sm">
              <span className="font-bold">FREE</span> delivery on this item
            </p>
            {product.inStock ? (
              <p className="mt-2 text-lg text-amz-instock">In Stock</p>
            ) : (
              <p className="mt-2 text-lg text-amz-price">Currently unavailable</p>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <AddToCartButton
                productId={product.id}
                disabled={!product.inStock}
                className="w-full py-2"
              />
              <BuyNowButton
                productId={product.id}
                disabled={!product.inStock}
                className="w-full py-2"
              />
            </div>

            <p className="mt-3 text-xs text-gray-600">
              Ships from and sold by{" "}
              <span className="text-amz-link">Jamazon (Mock)</span>.
            </p>
          </div>
        </aside>
      </div>

      {/* Filler "from the manufacturer" section */}
      <section className="mt-6 rounded-md bg-white p-4">
        <h2 className="mb-2 text-lg font-bold">Product information</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-gray-100 py-1">
            <dt className="text-gray-500">Brand</dt>
            <dd>{product.brand}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 py-1">
            <dt className="text-gray-500">Category</dt>
            <dd>{product.category}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 py-1">
            <dt className="text-gray-500">Price</dt>
            <dd>{formatCents(product.priceCents)}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 py-1">
            <dt className="text-gray-500">Rating</dt>
            <dd>
              {product.rating.toFixed(1)} / 5 (
              {product.ratingCount.toLocaleString("en-US")} ratings)
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
