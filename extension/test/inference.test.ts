import { describe, expect, it } from "vitest";
import {
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
