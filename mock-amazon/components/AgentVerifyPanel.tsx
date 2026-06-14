"use client";

import { type RefObject } from "react";
import { OrderResult, type ResultView } from "./OrderResult";

// The "Agent Authorization (Nomad Passport)" section: the verification trigger.
// Presentational + controlled by the checkout page (which owns cart + state).
export function AgentVerifyPanel({
  agentId,
  onAgentIdChange,
  onPlaceOrder,
  status,
  result,
  canSubmit,
  validationError,
  inputRef,
  onReset,
}: {
  agentId: string;
  onAgentIdChange: (value: string) => void;
  onPlaceOrder: () => void;
  status: "idle" | "verifying";
  result: ResultView | null;
  canSubmit: boolean;
  validationError: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onReset: () => void;
}) {
  const verifying = status === "verifying";

  return (
    <section
      aria-labelledby="agent-auth-heading"
      data-testid="agent-verify-panel"
      className="rounded-md border border-gray-300 bg-white p-5"
    >
      <h2
        id="agent-auth-heading"
        className="text-lg font-bold text-[#0f1111]"
      >
        Agent Authorization (Nomad Passport)
      </h2>
      <p className="mt-1 text-sm text-gray-700">
        At checkout your agent&apos;s identity is verified against its on-chain
        permission passport. Only an agent whose passport authorizes purchases can
        complete this order.
      </p>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          onPlaceOrder();
        }}
      >
        <label
          htmlFor="agent-id"
          className="block text-sm font-semibold text-[#0f1111]"
        >
          Agent ID (public key)
        </label>
        <p className="text-xs text-gray-600">
          Paste your agent&apos;s Nomad passport public key.
        </p>
        <input
          ref={inputRef}
          id="agent-id"
          name="agentId"
          data-testid="agent-id-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={agentId}
          onChange={(e) => onAgentIdChange(e.target.value)}
          placeholder="e.g. Ag3ntPa55port1111111111111111111111111111111"
          aria-describedby="agent-id-help"
          aria-invalid={validationError ? "true" : undefined}
          className="mt-1 w-full rounded-md border border-gray-400 px-3 py-2 font-mono text-sm shadow-inner outline-none focus:border-amz-orange focus:ring-2 focus:ring-[#f7dfa5]"
          disabled={verifying || result?.decision === "approved"}
        />
        <p id="agent-id-help" className="mt-1 text-xs text-gray-500">
          The submitted Agent ID is checked against its authorizing passport and
          required purchase scope.
        </p>

        {validationError && (
          <p
            data-testid="validation-error"
            role="alert"
            className="mt-2 text-sm font-medium text-amz-price"
          >
            {validationError}
          </p>
        )}

        <button
          id="place-order"
          data-testid="place-order"
          type="submit"
          disabled={!canSubmit || verifying || result?.decision === "approved"}
          className="amz-cta mt-4 w-full px-4 py-2 font-medium sm:w-auto sm:min-w-[14rem]"
        >
          {verifying ? "Verifying agent passport…" : "Place order"}
        </button>
      </form>

      {/* Inline result region — persistent, readable, announced politely. */}
      <div
        id="verify-result"
        data-testid="verify-result"
        aria-live="polite"
        className="mt-4 empty:mt-0"
      >
        {result && <OrderResult result={result} onReset={onReset} />}
      </div>
    </section>
  );
}
