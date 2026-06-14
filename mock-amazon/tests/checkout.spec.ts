import { test, expect, type Page } from "@playwright/test";

// The one known-good Agent ID (mirrors lib/verifyAgent.ts AUTHORIZED_PASSPORTS).
const GOOD_AGENT_ID = "Ag3ntPa55port1111111111111111111111111111111";
const UNKNOWN_AGENT_ID = "TotallyMadeUpAgentDoesNotExist00000000000000";

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

test("§11.1 happy path: authorized agent completes the purchase", async ({
  page,
}) => {
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
});

test("§11.2 fraud path: unknown agent is blocked, cart preserved", async ({
  page,
}) => {
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(UNKNOWN_AGENT_ID);
  await page.getByTestId("place-order").click();

  const fraud = page.getByTestId("order-fraudulent");
  await expect(fraud).toBeVisible({ timeout: 5000 });
  await expect(fraud).toContainText("Fraudulent transaction detected");
  await expect(page.getByTestId("order-number")).toHaveCount(0);
  // Cart preserved on fraud.
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("§11.3 empty Agent ID: inline validation error", async ({ page }) => {
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("validation-error")).toBeVisible();
  await expect(page.getByTestId("order-approved")).toHaveCount(0);
  await expect(page.getByTestId("order-fraudulent")).toHaveCount(0);
});

test("§11.4 empty cart: cannot place order, prompted to shop", async ({
  page,
}) => {
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-empty")).toBeVisible();
  await expect(page.getByTestId("place-order")).toHaveCount(0);
});

test("fraud → reset → retry with good ID approves", async ({ page }) => {
  await addFirstProductAndGoToCheckout(page);

  await page.getByTestId("agent-id-input").fill(UNKNOWN_AGENT_ID);
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

test("§11.6 no network: placing an order issues zero requests", async ({
  page,
}) => {
  await addFirstProductAndGoToCheckout(page);
  await page.getByTestId("agent-id-input").fill(GOOD_AGENT_ID);

  // Record any network call that happens during/after submit.
  const requests: string[] = [];
  const onRequest = (req: import("@playwright/test").Request) => {
    // Ignore navigations/asset loads that already happened; we only watch from here.
    requests.push(req.url());
  };
  page.on("request", onRequest);

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("order-approved")).toBeVisible({
    timeout: 5000,
  });
  page.off("request", onRequest);

  // No XHR/fetch to any API — the only allowed entries would be static chunks if
  // a route prefetch fired; assert specifically that nothing hits an API path.
  const apiCalls = requests.filter((u) => /\/api\//.test(u));
  expect(apiCalls).toEqual([]);
});
