"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { AgentVerifyPanel } from "@/components/AgentVerifyPanel";
import { Price } from "@/components/Price";
import { formatCents } from "@/lib/money";
import { verifyAgent } from "@/lib/verifyAgent";
import type { ResultView } from "@/components/OrderResult";

export default function CheckoutPage() {
  const { detailedItems, itemCount, subtotalCents, clear, ready } = useCart();

  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying">("idle");
  const [result, setResult] = useState<ResultView | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Shipping is free in this mock; the order total equals the item subtotal.
  const totalCents = subtotalCents;

  function handlePlaceOrder() {
    setValidationError(null);

    // §8.1 / §11.3–11.4 — validate before running the (mock) verification.
    // NOTE: the Place order button stays enabled whenever the cart is non-empty
    // (even with a blank Agent ID) so this validation path is reachable, which the
    // acceptance tests require. A blank field yields an inline validation error,
    // not the fraud block.
    if (itemCount === 0) {
      setValidationError(
        "Your cart is empty. Add an item before placing an order.",
      );
      return;
    }
    if (!agentId.trim()) {
      setValidationError(
        "Please enter your Agent ID (Nomad passport public key) to continue.",
      );
      inputRef.current?.focus();
      return;
    }

    // Snapshot the order NOW, before any cart mutation, for the confirmation.
    const lines = detailedItems.map(({ product, quantity }) => ({
      title: product.title,
      quantity,
      lineCents: product.priceCents * quantity,
    }));
    const snapshotTotal = totalCents;

    // Cosmetic "verifying" delay to feel like a real check. NO network request is
    // made — verifyAgent() is a synchronous, hardcoded, client-side lookup.
    setStatus("verifying");
    window.setTimeout(() => {
      const decision = verifyAgent(agentId);
      if (decision.decision === "approved") {
        setResult({
          decision: "approved",
          orderId: decision.orderId,
          label: decision.label,
          lines,
          totalCents: snapshotTotal,
        });
        clear(); // §8.4 — clear the cart only on approval
      } else {
        // §8.5 — keep the cart on fraud
        setResult({ decision: "fraudulent", reason: decision.reason });
      }
      setStatus("idle");
    }, 800);
  }

  function handleReset() {
    setResult(null);
    setValidationError(null);
    setAgentId("");
    // Let React re-enable the input before focusing it.
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const canSubmit = ready && itemCount > 0;
  const approved = result?.decision === "approved";

  // --- Empty cart (and no successful order yet): prompt to shop. ---
  if (ready && itemCount === 0 && !approved) {
    return (
      <div
        className="rounded-md bg-white p-8 text-center"
        data-testid="checkout-empty"
      >
        <h1 className="text-2xl font-bold text-[#0f1111]">
          Your cart is empty
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          You can&apos;t place an order without any items. Add something first.
        </p>
        <Link
          href="/"
          data-testid="checkout-continue-shopping"
          className="amz-cta mt-4 inline-block px-6 py-2 font-medium"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="checkout-page">
      <h1 className="mb-3 border-b border-gray-300 pb-2 text-2xl font-medium text-[#0f1111]">
        Checkout{" "}
        <span className="text-sm font-normal text-gray-500">(Jamazon Mock)</span>
      </h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: shipping, payment (decorative) + agent verification */}
        <div className="space-y-4 lg:col-span-8">
          {/* Decorative shipping block */}
          <section className="rounded-md border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-bold text-[#0f1111]">
              1. Shipping address
            </h2>
            <div className="mt-2 text-sm text-gray-700">
              <p className="font-semibold">Demo Shopper</p>
              <p>123 Placeholder Lane</p>
              <p>Apt 4 · Springfield, CA 90000</p>
              <p>United States</p>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Prefilled demo address — decorative only, no real shipping occurs.
            </p>
          </section>

          {/* Decorative payment block */}
          <section className="rounded-md border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-bold text-[#0f1111]">
              2. Payment method
            </h2>
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <span
                aria-hidden="true"
                className="rounded bg-amz-slate px-2 py-0.5 text-xs font-bold text-white"
              >
                VISA
              </span>
              <span>Jamazon Rewards •••• •••• •••• 4242</span>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Prefilled demo card — decorative only. No real payment is processed
              and no card data is collected.
            </p>
          </section>

          {/* 3. Agent authorization — the verification trigger */}
          <div>
            <h2 className="mb-2 text-lg font-bold text-[#0f1111]">
              3. Authorize &amp; place order
            </h2>
            <AgentVerifyPanel
              agentId={agentId}
              onAgentIdChange={(v) => {
                setAgentId(v);
                if (validationError) setValidationError(null);
              }}
              onPlaceOrder={handlePlaceOrder}
              status={status}
              result={result}
              canSubmit={canSubmit}
              validationError={validationError}
              inputRef={inputRef}
              onReset={handleReset}
            />
          </div>
        </div>

        {/* Right: order summary */}
        <aside className="lg:col-span-4" aria-label="Order summary">
          <div className="sticky top-3 rounded-md border border-gray-200 bg-white p-5">
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={!canSubmit || status === "verifying" || approved}
              data-testid="place-order-summary"
              className="amz-cta w-full px-4 py-2 font-medium"
            >
              {status === "verifying" ? "Verifying…" : "Place your order"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">
              By placing your order you authorize this purchase with your Nomad
              agent passport.
            </p>

            <hr className="my-3 border-gray-200" />

            <h2 className="text-lg font-bold text-[#0f1111]">Order Summary</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>
                  Items ({itemCount})
                </dt>
                <dd>{formatCents(subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Shipping &amp; handling</dt>
                <dd>{formatCents(0)}</dd>
              </div>
            </dl>
            <hr className="my-2 border-gray-200" />
            <div className="flex items-baseline justify-between text-amz-price">
              <span className="text-lg font-bold">Order total</span>
              <span className="font-bold" data-testid="checkout-total">
                <Price cents={totalCents} size="sm" />
              </span>
            </div>

            {/* Line items */}
            <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs text-gray-700">
              {detailedItems.map(({ product, quantity }) => (
                <li key={product.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {product.title}{" "}
                    <span className="text-gray-400">× {quantity}</span>
                  </span>
                  <span className="shrink-0">
                    {formatCents(product.priceCents * quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
