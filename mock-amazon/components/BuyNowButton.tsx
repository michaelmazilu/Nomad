"use client";

import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";

// "Buy Now": add to cart, then jump straight to checkout. All client-side.
export function BuyNowButton({
  productId,
  quantity = 1,
  disabled = false,
  className = "",
}: {
  productId: string;
  quantity?: number;
  disabled?: boolean;
  className?: string;
}) {
  const { addItem } = useCart();
  const router = useRouter();

  function handleClick() {
    addItem(productId, quantity);
    router.push("/checkout");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-testid="buy-now"
      aria-label="Buy now: add this item and go to checkout"
      className={`amz-cta amz-cta-buy px-3 py-1.5 font-medium ${className}`}
    >
      Buy Now
    </button>
  );
}
