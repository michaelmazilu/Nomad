import Link from "next/link";
import { formatCents } from "@/lib/money";
import { fraudReasonMessage, type FraudReason } from "@/lib/verifyAgent";

export interface PurchasedLine {
  title: string;
  quantity: number;
  lineCents: number;
}

// Snapshot of a successful order, captured at submit time BEFORE the cart is
// cleared, so the confirmation can list what was bought.
export interface ApprovedView {
  decision: "approved";
  orderId: string;
  label: string;
  lines: PurchasedLine[];
  totalCents: number;
}

export interface FraudView {
  decision: "fraudulent";
  reason: FraudReason;
}

export type ResultView = ApprovedView | FraudView;

// Presentational result block. Renders persistent, readable text (NOT a toast)
// so a DOM-driven agent can observe the outcome after "Place order".
export function OrderResult({
  result,
  onReset,
}: {
  result: ResultView;
  onReset?: () => void;
}) {
  if (result.decision === "approved") {
    return (
      <div
        data-testid="order-approved"
        data-decision="approved"
        className="rounded-md border border-amz-instock bg-[#f0fbf0] p-5"
      >
        <h2 className="flex items-center gap-2 text-xl font-bold text-amz-instock">
          <span aria-hidden="true">✓</span> Order placed, thank you!
        </h2>
        <p className="mt-1 text-sm text-[#0f1111]">
          Your order is confirmed. A confirmation would normally be emailed to
          you.
        </p>

        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="font-semibold">Order number:</dt>
            <dd data-testid="order-number" className="font-mono">
              {result.orderId}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Verified agent:</dt>
            <dd data-testid="verified-agent-label">{result.label}</dd>
          </div>
        </dl>

        <div className="mt-3 border-t border-green-200 pt-2">
          <h3 className="text-sm font-semibold">Items purchased</h3>
          <ul className="mt-1 space-y-1 text-sm" data-testid="purchased-items">
            {result.lines.map((line, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span className="min-w-0 truncate">
                  {line.title}{" "}
                  <span className="text-gray-500">× {line.quantity}</span>
                </span>
                <span className="shrink-0">{formatCents(line.lineCents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-right text-base font-bold">
            Order total:{" "}
            <span data-testid="order-total">
              {formatCents(result.totalCents)}
            </span>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/order/result?status=approved&order=${encodeURIComponent(
              result.orderId,
            )}&label=${encodeURIComponent(result.label)}&total=${result.totalCents}`}
            data-testid="view-order-details"
            className="amz-cta px-4 py-1.5 font-medium"
          >
            View order details
          </Link>
          <Link
            href="/"
            data-testid="back-to-shop"
            className="text-sm text-amz-link hover:underline"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  // Any non-approval. The block, data-testid and data-reason are preserved for
  // DOM-driven agents and tests, but the heading is reason-aware: a real on-chain
  // denial reads as fraud, while an outage or a malformed ID reads as what it is.
  const heading =
    result.reason === "verifier_unavailable"
      ? "Verification unavailable"
      : result.reason === "bad_agent_id"
        ? "Couldn’t verify that Agent ID"
        : result.reason === "empty_agent_id"
          ? "Agent ID required"
          : "Fraudulent transaction detected";

  return (
    <div
      data-testid="order-fraudulent"
      data-decision="fraudulent"
      data-reason={result.reason}
      className="rounded-md border-2 border-amz-price bg-[#fff0f0] p-5"
    >
      <h2 className="flex items-center gap-2 text-xl font-bold text-amz-price">
        <span aria-hidden="true">⚠️</span> {heading}
      </h2>
      <p className="mt-2 text-sm text-[#0f1111]" data-testid="fraud-reason">
        {fraudReasonMessage(result.reason)}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        Your order was <span className="font-semibold">not</span> placed and
        your cart has been preserved.
      </p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          data-testid="use-different-agent"
          className="amz-cta mt-4 px-4 py-1.5 font-medium"
        >
          Use a different Agent ID
        </button>
      )}
    </div>
  );
}
