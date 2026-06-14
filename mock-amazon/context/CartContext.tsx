"use client";

// Cart state lives entirely in the client: React Context + localStorage.
// There is NO database and NO server persistence (POC constraint).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PRODUCTS, type Product } from "@/lib/products";

export interface CartItem {
  productId: string;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  /** True once we've hydrated from localStorage — guards SSR/CSR mismatch. */
  ready: boolean;
  addItem: (productId: string, quantity?: number) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  itemCount: number;
  subtotalCents: number;
  /** Items joined with their product record, in catalog order. */
  detailedItems: Array<{ product: Product; quantity: number }>;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "mock-amazon-cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once, on mount, to avoid an SSR/CSR mismatch.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(
            parsed
              .filter(
                (i): i is CartItem =>
                  i &&
                  typeof i.productId === "string" &&
                  typeof i.quantity === "number",
              )
              .map((i) => ({ productId: i.productId, quantity: i.quantity })),
          );
        }
      }
    } catch {
      // Corrupt/unavailable storage → start with an empty cart.
    }
    setReady(true);
  }, []);

  // Persist on every change (only after hydration so we don't clobber storage).
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage write failures (private mode, quota, etc.).
    }
  }, [items, ready]);

  function addItem(productId: string, quantity = 1) {
    if (quantity <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === productId
            ? { ...i, quantity: i.quantity + quantity }
            : i,
        );
      }
      return [...prev, { productId, quantity }];
    });
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function setQuantity(productId: string, quantity: number) {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.productId !== productId);
      return prev.map((i) =>
        i.productId === productId ? { ...i, quantity } : i,
      );
    });
  }

  function clear() {
    setItems([]);
  }

  const detailedItems = useMemo(() => {
    // Preserve catalog order for a stable, predictable DOM.
    return PRODUCTS.flatMap((product) => {
      const item = items.find((i) => i.productId === product.id);
      return item ? [{ product, quantity: item.quantity }] : [];
    });
  }, [items]);

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const subtotalCents = useMemo(
    () =>
      detailedItems.reduce(
        (sum, { product, quantity }) => sum + product.priceCents * quantity,
        0,
      ),
    [detailedItems],
  );

  const value: CartContextValue = {
    items,
    ready,
    addItem,
    removeItem,
    setQuantity,
    clear,
    itemCount,
    subtotalCents,
    detailedItems,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
