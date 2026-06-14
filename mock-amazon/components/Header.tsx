"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";

// Amazon-like header. The search box is DECORATIVE (non-functional) and marked as
// such via aria so it never traps an agent — submitting it just no-ops.
export function Header() {
  const { itemCount, ready } = useCart();

  return (
    <header data-testid="site-header">
      {/* Top navy bar */}
      <div className="bg-amz-navy text-white">
        <div className="mx-auto flex max-w-[1500px] items-center gap-2 px-2 py-1.5 sm:gap-3">
          {/* Brand wordmark (NOT Amazon's logo/smile) */}
          <Link
            href="/"
            data-testid="brand-home"
            aria-label="Jamazon home"
            className="flex shrink-0 items-end rounded px-2 py-1 hover:outline hover:outline-1 hover:outline-white/60"
          >
            <span className="text-2xl font-bold tracking-tight">Jamazon</span>
            <span className="mb-1 ml-0.5 text-amz-yellow">▾</span>
          </Link>

          {/* Deliver-to (decorative) */}
          <div className="hidden items-center text-xs lg:flex">
            <span aria-hidden="true" className="mr-1">📍</span>
            <span>
              <span className="text-gray-300">Deliver to</span>
              <br />
              <span className="font-bold">United States</span>
            </span>
          </div>

          {/* Decorative search box */}
          <form
            role="search"
            aria-label="Site search (decorative demo — not functional)"
            className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="text"
              aria-label="Jamazon (decorative)"
              data-testid="search-input-decorative"
              placeholder="Jamazon"
              tabIndex={-1}
              className="min-w-0 flex-1 px-3 py-2 text-sm text-white outline-none"
            />
            <button
              type="submit"
              aria-label="Search (decorative — does nothing in this demo)"
              tabIndex={-1}
              className="bg-amz-orange px-4 text-black"
            >
              🔍
            </button>
          </form>

          {/* Account / Returns (decorative links) */}
          <Link
            href="/"
            className="hidden shrink-0 rounded px-2 py-1 text-xs hover:outline hover:outline-1 hover:outline-white/60 md:block"
          >
            <span className="text-gray-300">Hello, sign in</span>
            <br />
            <span className="font-bold">Account &amp; Lists</span>
          </Link>
          <Link
            href="/"
            className="hidden shrink-0 rounded px-2 py-1 text-xs hover:outline hover:outline-1 hover:outline-white/60 md:block"
          >
            <span className="text-gray-300">Returns</span>
            <br />
            <span className="font-bold">&amp; Orders</span>
          </Link>

          {/* Cart with live item-count badge */}
          <Link
            href="/cart"
            data-testid="cart-link"
            aria-label={`Shopping cart, ${ready ? itemCount : 0} item${itemCount === 1 ? "" : "s"}`}
            className="relative flex shrink-0 items-end gap-1 rounded px-2 py-1 hover:outline hover:outline-1 hover:outline-white/60"
          >
            <span className="relative">
              <span aria-hidden="true" className="text-2xl">🛒</span>
              <span
                data-testid="cart-count"
                aria-hidden="true"
                className="absolute -top-1 left-3 min-w-[1.1rem] rounded-full bg-amz-orange px-1 text-center text-xs font-bold text-amz-navy"
              >
                {ready ? itemCount : 0}
              </span>
            </span>
            <span className="hidden text-sm font-bold sm:inline">Cart</span>
          </Link>
        </div>
      </div>

      {/* Secondary slate nav strip */}
      <nav
        aria-label="Primary"
        className="bg-amz-slate text-white"
        data-testid="secondary-nav"
      >
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 overflow-x-auto px-3 py-1 text-sm">
          <Link href="/" className="whitespace-nowrap font-bold hover:underline">
            ☰ All
          </Link>
          {["Today's Deals", "Smart Home", "Electronics", "Kitchen", "Outdoors", "Office", "Customer Service"].map(
            (label) => (
              <Link
                key={label}
                href="/"
                className="whitespace-nowrap hover:underline"
              >
                {label}
              </Link>
            ),
          )}
        </div>
      </nav>
    </header>
  );
}
