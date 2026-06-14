"use client";

import Link from "next/link";
import type { Product } from "@/lib/products";
import { useCart } from "@/context/CartContext";
import { ProductImage } from "./ProductImage";
import { Price } from "./Price";
import { QuantityStepper } from "./QuantityStepper";

export function CartItemRow({
  product,
  quantity,
}: {
  product: Product;
  quantity: number;
}) {
  const { setQuantity, removeItem } = useCart();

  return (
    <div
      data-testid="cart-item"
      data-product-id={product.id}
      className="flex gap-4 border-b border-gray-200 py-4"
    >
      <Link href={`/product/${product.id}`} className="shrink-0">
        <ProductImage product={product} size="thumb" className="h-24 w-24" />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/product/${product.id}`}
          className="line-clamp-2 text-base font-medium text-[#0f1111] hover:text-amz-link-hover"
        >
          {product.title}
        </Link>
        {product.inStock ? (
          <p className="text-xs text-amz-instock">In Stock</p>
        ) : (
          <p className="text-xs text-amz-price">Currently unavailable</p>
        )}
        <p className="text-xs text-gray-600">Eligible for FREE Shipping</p>

        <div className="mt-2 flex items-center gap-3">
          <QuantityStepper
            quantity={quantity}
            onChange={(q) => setQuantity(product.id, q)}
            idSuffix={product.id}
          />
          <span aria-hidden="true" className="text-gray-300">
            |
          </span>
          <button
            type="button"
            onClick={() => removeItem(product.id)}
            data-testid="remove-item"
            aria-label={`Delete ${product.title} from cart`}
            className="text-xs text-amz-link hover:text-amz-link-hover hover:underline"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <Price cents={product.priceCents * quantity} />
      </div>
    </div>
  );
}
