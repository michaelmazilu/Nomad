import type { ExtractedTabContext } from "./inference";

export function extractChatGptConversation(): ExtractedTabContext {
  const readable = (el: Element): string => {
    const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
    return text.replace(/\s+/g, " ").trim();
  };

  const messageNodes = Array.from(
    document.querySelectorAll("[data-message-author-role]"),
  );
  const messages = messageNodes
    .map((node) => {
      const role = node.getAttribute("data-message-author-role") ?? "message";
      const text = readable(node);
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean);

  const text =
    messages.length > 0
      ? messages.join("\n")
      : readable(document.querySelector("main") ?? document.body);

  return {
    url: location.href,
    title: document.title,
    text,
  };
}

/** The most recent message the user sent in the active ChatGPT conversation. */
export function extractLatestChatGptUserMessage(): ExtractedTabContext {
  const readable = (el: Element): string => {
    const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
    return text.replace(/\s+/g, " ").trim();
  };

  const userNodes = Array.from(
    document.querySelectorAll('[data-message-author-role="user"]'),
  );
  const last = userNodes[userNodes.length - 1];

  return {
    url: location.href,
    title: document.title,
    text: last ? readable(last) : "",
  };
}
