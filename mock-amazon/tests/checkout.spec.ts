import { test, expect, type Page, type Route } from "@playwright/test";

// Valid Base58 (32-byte) Solana public keys. /api/verify is intercepted in every
// test (see mockVerify) so the suite is deterministic. GOOD_AGENT_ID is the one
// the storefront approves (the demo Agent ID, mirrors DEMO_AGENT_ID in
// lib/verifyAgent.ts); OTHER_AGENT_ID is any other valid key — never approved.
const GOOD_AGENT_ID = "Fxo8xDJaaAtKYef5CgpuvfSYijrDDeYHX5pbbUdm4gte";
const OTHER_AGENT_ID = "2cUASaguALsZffvL4sgzaU4YsH5o4Yn9NWYRSKizKWJx";

interface VerifyBody {
  status: string;
  ok: boolean;
  label?: string;
  scopes?: string[];
}

// Intercept POST /api/verify so the suite is deterministic and never depends on
// live devnet. `decide` maps the submitted agentId -> { httpStatus, body }.
function mockVerify(
  page: Page,
  decide: (agentId: string) => { httpStatus: number; body: VerifyBody },
): { count: () => number } {
  let calls = 0;
  void page.route("**/api/verify", async (route: Route) => {
    calls += 1;
    const sent =
      (route.request().postDataJSON() as { agentId?: string } | null) ?? {};
    const { httpStatus, body } = decide((sent.agentId ?? "").trim());
    await route.fulfill({
      status: httpStatus,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { count: () => calls };
}

// The on-chain read returns ok for `good`; everything else reads as no_passport.
function okFor(good: string) {
  return (agentId: string) =>
    agentId === good
      ? {
          httpStatus: 200,
          body: {
            status: "ok",
            ok: true,
            label: "Shopping Agent",
            scopes: ["payments.charge", "commerce.checkout"],
          } satisfies VerifyBody,
        }
      : {
          httpStatus: 403,
          body: { status: "no_passport", ok: false } satisfies VerifyBody,
        };
}

// Drive the flow using ONLY data-testid / accessible-name selectors — the same
// surface a DOM-driven agent would use. No hover, drag, or visual tricks.
async function addFirstProductAndGoToCheckout(page: Page) {
  await page.goto("/");
  await page.getByTestId("add-to-cart").first().click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.getByTestId("cart-link").click();
  await page.getByTestId("proceed-to-checkout").click();
  await expect(page.getByTestId("checkout-page")).toBeVisible();
}

test("§11.1 happy path: the demo agent completes the purchase", async ({
  page,
}) => {
  const verify = mockVerify(page, okFor(GOOD_AGENT_ID));
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(GOOD_AGENT_ID);
  await page.getByTestId("place-order").click();

  const approved = page.getByTestId("order-approved");
  await expect(approved).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId("order-number")).toContainText("MOCK-");
  await expect(page.getByTestId("verified-agent-label")).toHaveText(
    "Shopping Agent",
  );
  // Cart cleared on approval.
  await expect(page.getByTestId("cart-count")).toHaveText("0");
  // Exactly one on-chain verification per submit.
  expect(verify.count()).toBe(1);
});

test("§11.2 fraud path: an unregistered agent is blocked, cart preserved", async ({
  page,
}) => {
  mockVerify(page, okFor(GOOD_AGENT_ID));
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(OTHER_AGENT_ID);
  await page.getByTestId("place-order").click();

  const fraud = page.getByTestId("order-fraudulent");
  await expect(fraud).toBeVisible({ timeout: 5000 });
  await expect(fraud).toContainText("Fraudulent transaction detected");
  await expect(fraud).toHaveAttribute("data-reason", "agent_not_authorized");
  await expect(page.getByTestId("order-number")).toHaveCount(0);
  // Cart preserved on a non-approval.
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("only the demo agent is approved: another valid passport is still blocked", async ({
  page,
}) => {
  // The on-chain read says ok for OTHER_AGENT_ID, yet only the demo ID is approved.
  mockVerify(page, okFor(OTHER_AGENT_ID));
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(OTHER_AGENT_ID);
  await page.getByTestId("place-order").click();

  const fraud = page.getByTestId("order-fraudulent");
  await expect(fraud).toBeVisible({ timeout: 5000 });
  await expect(fraud).toHaveAttribute("data-reason", "agent_not_authorized");
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("not_permitted: a non-demo passport without the purchase scope is blocked", async ({
  page,
}) => {
  mockVerify(page, () => ({
    httpStatus: 403,
    body: { status: "not_permitted", ok: false, scopes: ["calendar.read"] },
  }));
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(OTHER_AGENT_ID);
  await page.getByTestId("place-order").click();

  const fraud = page.getByTestId("order-fraudulent");
  await expect(fraud).toBeVisible({ timeout: 5000 });
  await expect(fraud).toHaveAttribute("data-reason", "action_not_permitted");
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("verifier unavailable: a non-demo id fails closed, cart preserved", async ({
  page,
}) => {
  mockVerify(page, () => ({
    httpStatus: 503,
    body: { status: "verifier_unavailable", ok: false },
  }));
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(OTHER_AGENT_ID);
  await page.getByTestId("place-order").click();

  const fraud = page.getByTestId("order-fraudulent");
  await expect(fraud).toBeVisible({ timeout: 5000 });
  await expect(fraud).toHaveAttribute("data-reason", "verifier_unavailable");
  await expect(fraud).toContainText("Verification unavailable");
  await expect(page.getByTestId("order-approved")).toHaveCount(0);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("§11.3 empty Agent ID: inline validation error, no verify call", async ({
  page,
}) => {
  const verify = mockVerify(page, okFor(GOOD_AGENT_ID));
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("validation-error")).toBeVisible();
  await expect(page.getByTestId("order-approved")).toHaveCount(0);
  await expect(page.getByTestId("order-fraudulent")).toHaveCount(0);
  // Validation short-circuits before the network call.
  expect(verify.count()).toBe(0);
});

test("§11.4 empty cart: cannot place order, prompted to shop", async ({
  page,
}) => {
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-empty")).toBeVisible();
  await expect(page.getByTestId("place-order")).toHaveCount(0);
});

test("fraud → reset → retry with the demo ID approves", async ({ page }) => {
  mockVerify(page, okFor(GOOD_AGENT_ID));
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(OTHER_AGENT_ID);
  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("order-fraudulent")).toBeVisible({
    timeout: 5000,
  });

  await page.getByTestId("use-different-agent").click();
  await page.getByTestId("agent-id-input").fill(GOOD_AGENT_ID);
  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("order-approved")).toBeVisible({
    timeout: 5000,
  });
});

test("§11.6 network contract: exactly one /api/verify call per submit", async ({
  page,
}) => {
  const verify = mockVerify(page, okFor(GOOD_AGENT_ID));
  await addFirstProductAndGoToCheckout(page);
  await page.getByTestId("agent-id-input").fill(GOOD_AGENT_ID);

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("order-approved")).toBeVisible({
    timeout: 5000,
  });

  // The contract: the checkout makes exactly one on-chain verification call per
  // submit (replacing the old "zero network requests" assertion).
  expect(verify.count()).toBe(1);
});
