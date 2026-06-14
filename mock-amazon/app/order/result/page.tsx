import Link from "next/link";
import { formatCents } from "@/lib/money";

// Standalone, shareable order-result page. The primary outcome renders inline on
// /checkout (#verify-result); this page exists as a friendly deep-linkable
// confirmation reached from the "View order details" link. It reads everything
// from the query string — no backend, no stored order.
export default async function OrderResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const order = typeof sp.order === "string" ? sp.order : undefined;
  const label = typeof sp.label === "string" ? sp.label : undefined;
  const totalRaw = typeof sp.total === "string" ? sp.total : undefined;
  const totalCents = totalRaw ? Number.parseInt(totalRaw, 10) : NaN;

  if (status === "approved" && order) {
    return (
      <div
        className="mx-auto max-w-2xl rounded-md border border-amz-instock bg-white p-8"
        data-testid="order-result-approved"
      >
        <h1 className="flex items-center gap-2 text-2xl font-bold text-amz-instock">
          <span aria-hidden="true">✓</span> Order placed, thank you!
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          Confirmation of your order is shown below.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="font-semibold">Order number:</dt>
            <dd className="font-mono">{order}</dd>
          </div>
          {label && (
            <div className="flex gap-2">
              <dt className="font-semibold">Verified agent:</dt>
              <dd>{label}</dd>
            </div>
          )}
          {Number.isFinite(totalCents) && (
            <div className="flex gap-2">
              <dt className="font-semibold">Order total:</dt>
              <dd>{formatCents(totalCents)}</dd>
            </div>
          )}
        </dl>
        <Link
          href="/"
          className="amz-cta mt-6 inline-block px-6 py-2 font-medium"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  if (status === "fraudulent") {
    return (
      <div
        className="mx-auto max-w-2xl rounded-md border-2 border-amz-price bg-white p-8"
        data-testid="order-result-fraudulent"
      >
        <h1 className="flex items-center gap-2 text-2xl font-bold text-amz-price">
          <span aria-hidden="true">⚠️</span> Fraudulent transaction detected
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          This agent&apos;s identity could not be verified against an authorizing
          passport. The order was not placed.
        </p>
        <Link
          href="/checkout"
          className="amz-cta mt-6 inline-block px-6 py-2 font-medium"
        >
          Back to checkout
        </Link>
      </div>
    );
  }

  // No/unknown params — generic state.
  return (
    <div
      className="mx-auto max-w-2xl rounded-md bg-white p-8 text-center"
      data-testid="order-result-empty"
    >
      <h1 className="text-2xl font-bold text-[#0f1111]">No recent order</h1>
      <p className="mt-2 text-sm text-gray-600">
        There&apos;s nothing to show here yet. Head back to the store to place an
        order.
      </p>
      <Link href="/" className="amz-cta mt-4 inline-block px-6 py-2 font-medium">
        Go to storefront
      </Link>
    </div>
  );
}
