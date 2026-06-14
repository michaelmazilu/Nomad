import Link from "next/link";
import type { Product } from "@/lib/products";
import { ProductImage } from "./ProductImage";
import { Stars } from "./Stars";
import { Price } from "./Price";
import { AddToCartButton } from "./AddToCartButton";

// Server-rendered card (good for agent readability) with a single client island
// for the "Add to Cart" button.
export function ProductCard({ product }: { product: Product }) {
  return (
    <article
      data-testid="product-card"
      data-product-id={product.id}
      className="flex flex-col rounded-md border border-gray-200 bg-white p-4"
    >
      <Link
        href={`/product/${product.id}`}
        data-testid="product-link"
        className="group"
        aria-label={`View details for ${product.title}`}
      >
        <ProductImage product={product} className="mb-3 h-44 w-full" />
        <h2 className="line-clamp-3 min-h-[3.6rem] text-sm font-medium text-[#0f1111] group-hover:text-amz-link-hover">
          {product.title}
        </h2>
      </Link>

      <div className="mt-1">
        <Stars rating={product.rating} count={product.ratingCount} />
      </div>

      <div className="mt-1">
        <Price cents={product.priceCents} />
      </div>

      <p className="mt-1 text-xs text-gray-700">
        <span className="font-bold">Fast, free delivery</span> available
      </p>

      {product.inStock ? (
        <p className="mt-1 text-sm text-amz-instock">In Stock</p>
      ) : (
        <p className="mt-1 text-sm text-amz-price">Currently unavailable</p>
      )}

      <div className="mt-3">
        <AddToCartButton
          productId={product.id}
          disabled={!product.inStock}
          className="w-full"
        />
      </div>
    </article>
  );
}
