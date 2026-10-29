/**
 * Email Template Catalog — sanitisation, placeholder rules and rendering.
 *
 * The point of these tests is the security boundary: a template is uploaded by
 * an administrator, but it is rendered into a customer's email client, so
 * executable markup must never survive a save and an unapproved placeholder
 * must never reach the dispatcher.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  bankTemplateVariables,
  extractTemplateVariables,
  renderEmailTemplate,
  sanitizeEmailHtml,
  templateSurchargeNgn,
  transactionTemplateVariables,
  validateEmailTemplate,
} from "./emailTemplates.js";

const BILLING_HTML = `<table><tr><td style="padding:16px">{{customer_name}} paid {{amount}} {{currency}}</td></tr></table>`;

/* ── Sanitisation ────────────────────────────────────────────────────────── */

test("script tags, event handlers and script URLs are stripped", () => {
  const dirty = `<div onclick="steal()"><script>alert(1)</script>
    <a href="javascript:alert(2)">Click</a>
    <img src="x" onerror="steal()" />
    <table><tr><td style="color:#111">Kept</td></tr></table></div>`;

  const result = sanitizeEmailHtml(dirty);

  assert.equal(/<script/i.test(result.html), false);
  assert.equal(/onclick|onerror/i.test(result.html), false);
  assert.equal(/javascript:/i.test(result.html), false);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /style="color:#111"/);
  assert.ok(result.removed.includes("<script>"));
  assert.ok(result.removed.includes("inline event handler"));
  assert.ok(result.removed.includes("script URL"));
});

test("entity-obfuscated script URLs are stripped while normal links survive", () => {
  const result = sanitizeEmailHtml(
    '<a href="java&#115;cript:alert(1)">one</a><a href="https&#58;//example.com/ok">two</a>',
  );

  assert.equal(result.html.includes("java&#115;cript"), false);
  assert.match(result.html, /https&#58;\/\/example\.com\/ok/);
});

test("CSS that executes is removed but layout CSS survives", () => {
  const dirty =
    "<style>.a{color:#10b981;width:100%}@import url(https://evil.test/x.css);.b{width:expression(alert(1))}</style>" +
    "<div style=\"padding:8px;background:expression(alert(1))\">Hi</div>";

  const result = sanitizeEmailHtml(dirty);

  assert.match(result.html, /\.a\{color:#10b981;width:100%\}/);
  assert.equal(/@import/i.test(result.html), false);
  assert.equal(/expression\s*\(/i.test(result.html), false);
});

test("iframe, form and meta refresh are stripped", () => {
  const result = sanitizeEmailHtml(
    `<meta http-equiv="refresh" content="0;url=https://evil.test"><iframe src="https://evil.test"></iframe><form action="/steal"><input name="x"></form><p>Body</p>`,
  );

  assert.match(result.html, /<p>Body<\/p>/);
  assert.equal(/<(iframe|form|input|meta)/i.test(result.html), false);
});

/* ── Placeholder validation ──────────────────────────────────────────────── */

test("approved placeholders are extracted and rendered with escaping", () => {
  assert.deepEqual(extractTemplateVariables(BILLING_HTML).sort(), [
    "amount",
    "currency",
    "customer_name",
  ]);

  const html = renderEmailTemplate(BILLING_HTML, {
    customer_name: "<b>Ada</b>",
    amount: "2,500.00",
    currency: "USD",
  });

  assert.match(html, /&lt;b&gt;Ada&lt;\/b&gt;/);
  assert.match(html, /2,500\.00 USD/);
});

test("an unapproved placeholder is rejected for the service type", () => {
  const result = validateEmailTemplate({
    title: "Billing layout",
    serviceType: "billing",
    htmlContent: "<p>Hello {{customer_name}}, your key is {{api_key}}</p>",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.htmlContent ?? "", /\{\{api_key\}\}/);
  }
});

test("a notifications layout cannot be filed as billing", () => {
  const result = validateEmailTemplate({
    title: "Transaction layout",
    serviceType: "billing",
    htmlContent: "<p>{{tx_hash}}</p>",
  });

  assert.equal(result.ok, false);
});

test("a valid template is stored sanitised with its price in credits", () => {
  const result = validateEmailTemplate({
    title: "Modern Invoice v1",
    serviceType: "billing",
    description: "Clean invoice layout",
    htmlContent: `<div><script>x()</script>${BILLING_HTML}</div>`,
    priceCredits: 2.5,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.priceCredits, 2.5);
  assert.equal(/<script/i.test(result.value.htmlContent), false);
  assert.equal(result.value.isActive, true);
  assert.deepEqual(result.value.removed, ["<script>"]);
});

test("empty HTML and negative prices are rejected", () => {
  const result = validateEmailTemplate({
    title: "Bad template",
    serviceType: "notifications",
    htmlContent: "   ",
    priceCredits: -1,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.htmlContent);
    assert.ok(result.errors.priceCredits);
  }
});

test("thumbnail accepts an https URL or an uploaded image data URL only", () => {
  const base = {
    title: "Thumb test",
    serviceType: "notifications" as const,
    htmlContent: "<p>{{amount}}</p>",
  };

  assert.equal(
    validateEmailTemplate({ ...base, thumbnailUrl: "https://cdn.test/preview.png" }).ok,
    true,
  );
  assert.equal(
    validateEmailTemplate({
      ...base,
      thumbnailUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    }).ok,
    true,
  );
  assert.equal(validateEmailTemplate({ ...base, thumbnailUrl: "javascript:alert(1)" }).ok, false);
});

/* ── Pricing & contexts ──────────────────────────────────────────────────── */

test("template credits convert to the platform's NGN rate", () => {
  assert.equal(templateSurchargeNgn(0), 0);
  assert.equal(templateSurchargeNgn(2.5), 37.5);
});

test("bank variables describe the notified party per leg", () => {
  const context = {
    platformName: "Cloudie",
    payload: {
      transaction: { amount: 2500, currency: "USD", status: "success" },
      sender: { fullName: "Ada", email: "ada@test.dev", accountNumber: "0123", bankName: "First" },
      receiver: { fullName: "Bayo", email: "bayo@test.dev", accountNumber: "9988", bankName: "North" },
      referenceCode: "REF-1",
      transactionId: "TXN-1",
      remarks: "Rent",
    },
  };

  const debit = bankTemplateVariables({ ...context, kind: "debit" });
  const credit = bankTemplateVariables({ ...context, kind: "credit" });

  assert.equal(debit.party_name, "Ada");
  assert.equal(credit.party_name, "Bayo");
  assert.equal(debit.notice_type, "Debit notice");
  assert.equal(credit.status, "Success");
  assert.equal(debit.amount, "2,500.00");
});

test("transaction variables carry the recipient and notice type", () => {
  const values = transactionTemplateVariables({
    platformName: "Cloudie",
    brandName: "Acme",
    recipientEmail: "ada@test.dev",
    noticeType: "deposit",
    amount: "0.05",
    currency: "BTC",
    transactionId: "0xabc",
    status: "SENT",
    message: "Incoming",
  });

  assert.equal(values.brand_name, "Acme");
  assert.equal(values.recipient_email, "ada@test.dev");
  assert.equal(values.status, "Sent");
  assert.equal(values.amount, "0.05");
});
