import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_STANDALONE_AI_URL, standaloneAiDestination } from "../src/lib/standaloneAiUrl.js";

test("fallback uses the confirmed standalone origin, never the unresolved Hub subdomain", () => {
  const destination = standaloneAiDestination(undefined, "?task=abc", "#results");
  assert.equal(FALLBACK_STANDALONE_AI_URL, "https://smaj-verified-delegation.onrender.com");
  assert.equal(destination, `${FALLBACK_STANDALONE_AI_URL}/?task=abc#results`);
  assert.equal(new URL(destination).hostname, "smaj-verified-delegation.onrender.com");
  assert.notEqual(new URL(destination).hostname, "ai.smajpihub.com");
});

test("a valid configured HTTPS origin is used with the Hub search and hash", () => {
  assert.equal(standaloneAiDestination("https://ai.example.net/path", "?view=tasks", "#jobs"), "https://ai.example.net/?view=tasks#jobs");
});

test("the unresolved hostname and invalid origins fall back safely", () => {
  assert.equal(standaloneAiDestination("https://ai.smajpihub.com/"), `${FALLBACK_STANDALONE_AI_URL}/`);
  assert.equal(standaloneAiDestination("http://ai.example.net/"), `${FALLBACK_STANDALONE_AI_URL}/`);
  assert.equal(standaloneAiDestination("not a URL"), `${FALLBACK_STANDALONE_AI_URL}/`);
});
