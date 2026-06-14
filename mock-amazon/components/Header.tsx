"use client";

import Image from "next/image";
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
          {/* Fictional Jamazon wordmark */}
          <Link
            href="/"
            data-testid="brand-home"
            aria-label="Jamazon home"
            className="flex shrink-0 items-center rounded px-1 py-0.5 hover:outline hover:outline-1 hover:outline-white/60"
          >
            <Image
              src="/jamazon-logo.png"
              alt="Jamazon.ca"
              width={825}
              height={270}
              priority
              className="h-10 w-auto sm:h-11"
            />
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
            className="flex h-11 min-w-0 flex-1 items-stretch overflow-hidden rounded-lg bg-white focus-within:ring-2 focus-within:ring-[#ff9900]"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="text"
              aria-label="Search Jamazon.ca (decorative)"
              data-testid="search-input-decorative"
              placeholder="Search Jamazon.ca"
              tabIndex={-1}
              className="min-w-0 flex-1 bg-white px-4 text-base text-[#0f1111] outline-none placeholder:text-[#6f7373] sm:text-lg"
            />
            <button
              type="submit"
              aria-label="Search (decorative — does nothing in this demo)"
              tabIndex={-1}
              className="flex w-14 shrink-0 items-center justify-center bg-amz-orange text-amz-navy hover:bg-[#f3a847]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
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
