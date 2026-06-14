"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";

// Client island: the only interactive part of an otherwise server-rendered card.
export function AddToCartButton({
  productId,
  quantity = 1,
  disabled = false,
  className = "",
  label = "Add to Cart",
}: {
  productId: string;
  quantity?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleClick() {
    addItem(productId, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-testid="add-to-cart"
      aria-label={`${label}: add this item to your shopping cart`}
      className={`amz-cta px-3 py-1.5 font-medium ${className}`}
    >
      {added ? "Added ✓" : label}
    </button>
  );
}
