import assert from "node:assert/strict";
import test from "node:test";
import {
  generateLookalikeDomains,
  normalizePhrase,
  sha256,
} from "../scripts/build-copycat-baseline.mjs";
import { scanTargetUrl } from "../scripts/scan-copycat-watch.mjs";

test("normalizes typographic punctuation for stable phrase fingerprints", () => {
  assert.equal(
    normalizePhrase(" A fragrance that begins like an object—and ends like a body. "),
    "a fragrance that begins like an object-and ends like a body.",
  );
  assert.equal(sha256("ARCANEUM").length, 64);
});

test("generates bounded, unique lookalike domains without the canonical domain", () => {
  const domains = generateLookalikeDomains("arcaneumperfumes.com", ["com", "co"], 40);
  assert.equal(domains.length, 40);
  assert.equal(new Set(domains).size, domains.length);
  assert.ok(!domains.includes("arcaneumperfumes.com"));
  assert.ok(domains.every((domain) => /\.(com|co)$/.test(domain)));
});

test("detects an exact protected phrase on a supplied target page", async () => {
  const baseline = {
    phrases: [{ id: "vesper-glass-body", text: "A fragrance that begins like an object and ends like a body." }],
    images: [],
  };
  const fetchImpl = async () =>
    new Response("<html><body>A fragrance that begins like an object and ends like a body.</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  const result = await scanTargetUrl("https://example.test", baseline, fetchImpl);
  assert.equal(result.status, "checked");
  assert.deepEqual(result.findings, [
    { kind: "signature_phrase", severity: "high", protected_id: "vesper-glass-body" },
  ]);
});
