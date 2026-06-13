import { describe, expect, it } from "vitest";
import {
  inferFromChatGptContext,
  isSupportedChatGptUrl,
  normalizeTabContext,
  parseInferenceJson,
  parseInferencePayload,
} from "../src/inference";

describe("ChatGPT tab support", () => {
  it("accepts ChatGPT origins only", () => {
    expect(isSupportedChatGptUrl("https://chatgpt.com/c/abc")).toBe(true);
    expect(isSupportedChatGptUrl("https://chat.openai.com/c/abc")).toBe(true);
    expect(isSupportedChatGptUrl("https://example.com")).toBe(false);
    expect(isSupportedChatGptUrl("not a url")).toBe(false);
  });
});

describe("context normalization", () => {
  it("normalizes whitespace and reports truncation", () => {
    const r = normalizeTabContext(
      {
        url: "https://chatgpt.com/c/abc",
        title: "  A   chat  ",
        text: "hello\n\nworld again",
      },
      8,
    );
    expect(r.title).toBe("A chat");
    expect(r.text).toBe("hello wo");
    expect(r.truncated).toBe(true);
    expect(r.originalLength).toBe("hello world again".length);
  });

  it("rejects empty readable text", () => {
    expect(() =>
      normalizeTabContext({
        url: "https://chatgpt.com/c/abc",
        title: "A chat",
        text: "  \n\t ",
      }),
    ).toThrow(/no readable/);
  });
});

describe("inference parsing", () => {
  it("accepts dynamic scopes and canonicalizes output", () => {
    const r = parseInferencePayload({
      agentName: "Repo agent",
      label: "Repo agent",
      scopes: ["GitHub.Repo.Read", "slack.message.send", "github.repo.read"],
      testAction: "GitHub.Repo.Read",
    });
    expect(r.scopes).toEqual(["github.repo.read", "slack.message.send"]);
    expect(r.testAction).toBe("github.repo.read");
    expect(r.riskLevel).toBe("low");
  });

  it("flags risky but valid output without rejecting it", () => {
    const r = parseInferencePayload({
      label: "Wallet agent",
      scopes: ["wallet.transfer", "system.*"],
    });
    expect(r.riskLevel).toBe("high");
    expect(r.warnings.join(" ")).toContain("Sensitive-looking scope");
  });

  it("rejects malformed JSON", () => {
    expect(() => parseInferenceJson("```json\n{}\n```")).toThrow(
      /not valid JSON/,
    );
  });

  it("rejects invalid or empty output", () => {
    expect(() =>
      parseInferencePayload({ label: "Bad", scopes: ["github.repo.*.read"] }),
    ).toThrow(/invalid inferred scopes/);
    expect(() => parseInferencePayload({ label: "Empty", scopes: [] })).toThrow(
      /at least one scope/,
    );
  });
});

describe("local ChatGPT fallback inference", () => {
  it("infers common tool scopes from ChatGPT context", () => {
    const context = normalizeTabContext({
      url: "https://chatgpt.com/c/abc",
      title: "Repo and Slack agent - ChatGPT",
      text: "user: Create a GitHub pull request summary and post it to Slack.",
    });
    const r = inferFromChatGptContext(
      context,
      "Inference proxy unavailable; used local ChatGPT inference.",
    );
    expect(r.label).toBe("Repo and Slack agent");
    expect(r.scopes).toContain("github.repo.read");
    expect(r.scopes).toContain("github.repo.write");
    expect(r.scopes).toContain("slack.message.send");
    expect(r.warnings[0]).toMatch(/proxy unavailable/);
  });

  it("falls back to a minimal ChatGPT scope when no tool is obvious", () => {
    const context = normalizeTabContext({
      url: "https://chatgpt.com/c/abc",
      title: "ChatGPT",
      text: "user: Help me think through my plan for today.",
    });
    const r = inferFromChatGptContext(context);
    expect(r.label).toBe("Help me think through my plan for today.");
    expect(r.scopes).toEqual(["chatgpt.conversation.read"]);
    expect(r.testAction).toBe("chatgpt.conversation.read");
  });
});
