"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { CartItemRow } from "@/components/CartItemRow";
import { Price } from "@/components/Price";
import { formatCents } from "@/lib/money";

export default function CartPage() {
  const { detailedItems, itemCount, subtotalCents, clear, ready } = useCart();

  // Avoid rendering cart contents until hydrated from localStorage.
  if (!ready) {
    return (
      <div className="rounded-md bg-white p-6" data-testid="cart-loading">
        <p className="text-gray-500">Loading your cart…</p>
      </div>
    );
  }

  if (detailedItems.length === 0) {
    return (
      <div
        className="rounded-md bg-white p-8 text-center"
        data-testid="cart-empty"
      >
        <h1 className="text-2xl font-bold text-[#0f1111]">
          Your Jamazon Cart is empty
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Browse the storefront and add an item to get started.
        </p>
        <Link
          href="/"
          data-testid="continue-shopping"
          className="amz-cta mt-4 inline-block px-6 py-2 font-medium"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid="cart-page"
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      {/* Items */}
      <section className="rounded-md bg-white p-5 lg:col-span-9">
        <div className="flex items-baseline justify-between border-b border-gray-200 pb-2">
          <h1 className="text-2xl font-medium text-[#0f1111]">Shopping Cart</h1>
          <button
            type="button"
            onClick={clear}
            data-testid="clear-cart"
            className="text-xs text-amz-link hover:underline"
          >
            Clear cart
          </button>
        </div>

        {detailedItems.map(({ product, quantity }) => (
          <CartItemRow key={product.id} product={product} quantity={quantity} />
        ))}

        <div className="pt-3 text-right text-base">
          Subtotal ({itemCount} item{itemCount === 1 ? "" : "s"}):{" "}
          <span className="font-bold" data-testid="cart-subtotal">
            {formatCents(subtotalCents)}
          </span>
        </div>
      </section>

      {/* Checkout summary */}
      <aside className="lg:col-span-3" aria-label="Order subtotal">
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <p className="text-base">
            Subtotal ({itemCount} item{itemCount === 1 ? "" : "s"}):{" "}
            <span className="font-bold">
              <Price cents={subtotalCents} size="sm" />
            </span>
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4" /> This order contains a
            gift
          </label>
          <Link
            href="/checkout"
            data-testid="proceed-to-checkout"
            aria-label="Proceed to checkout"
            className="amz-cta mt-3 block px-4 py-2 text-center font-medium"
          >
            Proceed to checkout
          </Link>
        </div>
      </aside>
    </div>
  );
}
