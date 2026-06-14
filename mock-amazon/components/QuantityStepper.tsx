"use client";

// Accessible +/- quantity control. Real <button>s with aria-labels and a live
// readout so a DOM-driven agent can operate it without hover/drag tricks.
export function QuantityStepper({
  quantity,
  onChange,
  min = 1,
  max = 99,
  idSuffix = "",
}: {
  quantity: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  idSuffix?: string;
}) {
  const dec = () => onChange(Math.max(min, quantity - 1));
  const inc = () => onChange(Math.min(max, quantity + 1));

  return (
    <div
      className="inline-flex items-center rounded-md border border-gray-300 bg-white shadow-sm"
      data-testid="quantity-stepper"
    >
      <button
        type="button"
        onClick={dec}
        disabled={quantity <= min}
        aria-label="Decrease quantity"
        data-testid="qty-decrease"
        className="px-3 py-1 text-lg leading-none text-gray-700 disabled:opacity-40"
      >
        −
      </button>
      <output
        aria-live="polite"
        aria-label="Quantity"
        data-testid={`qty-value${idSuffix ? `-${idSuffix}` : ""}`}
        className="min-w-[2.5rem] px-2 text-center text-sm font-medium tabular-nums"
      >
        {quantity}
      </output>
      <button
        type="button"
        onClick={inc}
        disabled={quantity >= max}
        aria-label="Increase quantity"
        data-testid="qty-increase"
        className="px-3 py-1 text-lg leading-none text-gray-700 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
