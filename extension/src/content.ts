// Isolated world: bridges window.nomad calls (CustomEvents from content-inject.ts
// running in MAIN world) to chrome.runtime.sendMessage (background worker),
// then fires the response back as another CustomEvent.

window.addEventListener("nomad:request", async (e: Event) => {
  const { id, type, ...params } = (e as CustomEvent<Record<string, unknown>>)
    .detail;
  try {
    const res = await chrome.runtime.sendMessage({ type, ...params });
    window.dispatchEvent(
      new CustomEvent("nomad:response", {
        detail: { requestId: id, ok: res.ok, data: res.data, error: res.error },
      }),
    );
  } catch (err) {
    window.dispatchEvent(
      new CustomEvent("nomad:response", {
        detail: { requestId: id, ok: false, error: String(err) },
      }),
    );
  }
});
