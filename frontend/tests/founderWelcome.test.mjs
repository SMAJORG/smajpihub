import test from "node:test";
import assert from "node:assert/strict";
import { formatFounderWelcomeMessage, isFounderWelcomeMessage, translateFounderWelcomeMessage } from "../src/lib/founderWelcome.ts";

const welcome = {
  senderId: "founder-uid",
  welcomeAccountId: "recipient-id",
  welcomeVersion: 1,
  message: `🎉 Welcome to SMAJ PI HUB!

Welcome to our real-world utility and GCV community-focused platform.

Please complete your profile and read our https://smajpihub.com/terms, https://smajpihub.com/privacy, and https://smajpihub.com/seller-agreement before using our services.

Our Live Services

- SMAJ Store — Buy and sell.
- SMAJ Jobs — Find work and hire.
- SMAJ Stream — Watch and explore.

Coming Soon: SMAJ Education.

Stay Connected

Follow our official SMAJ PI HUB social media channels:

Telegram: https://t.me/smajpihub

X: https://x.com/smajpihub

A Message from the Founder & CEO

Your honest feedback matters. Please share your suggestions and message me directly here on SMAJ PI HUB.

Follow me on X: https://x.com/Devsmaj

CONNECT • EMPOWER • GROW

— Founder & CEO, SMAJ PI HUB`,
};

test("only recognizes the versioned automatic welcome sent by the conversation participant", () => {
  assert.equal(isFounderWelcomeMessage({ participantId: "founder-uid" }, welcome, "recipient"), true);
  assert.equal(isFounderWelcomeMessage({ participantId: "someone-else" }, welcome, "recipient"), false);
  assert.equal(isFounderWelcomeMessage({ participantId: "founder-uid" }, { ...welcome, welcomeVersion: undefined }, "recipient"), false);
  assert.equal(isFounderWelcomeMessage({ participantId: "founder-uid" }, { ...welcome, senderId: "recipient" }, "recipient"), false);
});

test("formats section headings, service lists, paragraphs, and links on separate lines", () => {
  const formatted = formatFounderWelcomeMessage(welcome.message);
  assert.match(formatted, /Our Live Services\n\n• SMAJ Store — Buy and sell\.\n• SMAJ Jobs — Find work and hire\.\n• SMAJ Stream — Watch and explore\./u);
  assert.match(formatted, /Coming Soon:\n• SMAJ Education\./u);
  assert.match(formatted, /Stay Connected\n\nFollow our official SMAJ PI HUB social media channels:/u);
  assert.match(formatted, /https:\/\/smajpihub\.com\/terms,\nhttps:\/\/smajpihub\.com\/privacy,\nand https:\/\/smajpihub\.com\/seller-agreement/u);
  assert.match(formatted, /Telegram:\nhttps:\/\/t\.me\/smajpihub\nX:\nhttps:\/\/x\.com\/smajpihub/u);
  assert.match(formatted, /A Message from the Founder & CEO/u);
});

test("translates prose using the selected language while retaining section and URL lines", async () => {
  const targets = [];
  const result = await translateFounderWelcomeMessage(welcome.message, "fr", async (lines, target) => {
    targets.push(target);
    return lines.map(line => "FR:" + line);
  });
  assert.ok(targets.length > 0 && targets.every(target => target === "fr"));
  assert.ok(result.includes("https://t.me/smajpihub"));
  assert.ok(result.includes("FR:🎉 Welcome to SMAJ PI HUB!"));
  assert.ok(result.includes("\n\n"));
});

test("translates mixed-language prose into the selected language", async () => {
  const calls = [];
  const result = await translateFounderWelcomeMessage("欢迎来到 SMAJ PI HUB。Live services: SMAJ STORE.", "zh", async (lines, target) => {
    calls.push({ lines, target });
    return lines.map(line => "ZH:" + line);
  });
  assert.equal(calls[0].target, "zh");
  assert.ok(calls[0].lines.some(line => line.includes("Live services")));
  assert.ok(calls[0].lines.some(line => line.includes("欢迎来到")));
  assert.ok(result.includes("ZH:欢迎来到 SMAJ PI HUB"));
  assert.ok(result.includes("ZH:欢迎来到 SMAJ PI HUB。Live services: SMAJ STORE."));
});
