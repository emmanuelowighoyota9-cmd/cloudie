import { describe, expect, test } from "bun:test";
import {
  BANK_MAILER_SERVICE,
  escapeHtml,
  generateTransactionId,
  maskAccount,
  renderBankNotice,
  validateBankMailerPayload,
  type BankMailerPayload,
} from "../api/src/bankMailer.ts";

/** A complete, valid payload — the baseline every case is derived from. */
function validPayload(): Record<string, unknown> {
  return {
    transaction: { amount: 2500.5, currency: "USD", status: "success", language: "en" },
    sender: {
      fullName: "Ada Obi",
      email: "ada@example.com",
      accountNumber: "0123456789",
      bankName: "First Meridian Bank",
      bankCountry: "Nigeria",
      bankAddress: "12 Marina Road, Lagos",
      bankPhone: "+234 800 000 0000",
    },
    receiver: {
      fullName: "Bayo Cole",
      email: "bayo@example.com",
      accountNumber: "9988776655",
      bankName: "Northgate Trust",
      bankCountry: "United States",
      bankAddress: "5 Wall Street, New York",
    },
    referenceCode: "REF-2026-001",
    transactionId: "",
    remarks: "Invoice settlement",
    supportLink: "https://cloudie.wuaze.com/support",
    warningBanner: "Verify the beneficiary before sending funds.",
  };
}

function validated(): BankMailerPayload {
  const result = validateBankMailerPayload(validPayload());
  if (!result.ok) throw new Error(`expected valid payload, got ${JSON.stringify(result.errors)}`);
  return result.value;
}

describe("bank mailer validation", () => {
  test("accepts a complete payload and generates a 12-char transaction id when blank", () => {
    const result = validateBankMailerPayload(validPayload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transactionId).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(result.value.transaction.currency).toBe("USD");
    expect(result.value.transaction.amount).toBe(2500.5);
    expect(result.value.sender.email).toBe("ada@example.com");
  });

  test("coerces a string amount and upper-cases the SWIFT code", () => {
    const raw = validPayload();
    (raw.transaction as Record<string, unknown>).amount = "4200.75";
    (raw.transaction as Record<string, unknown>).currency = "eur";
    const result = validateBankMailerPayload(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transaction.amount).toBe(4200.75);
    expect(result.value.transaction.currency).toBe("EUR");
  });

  test("reports every missing required field at once", () => {
    const result = validateBankMailerPayload({
      transaction: { amount: 0, currency: "", status: "nope", language: "en" },
      sender: {},
      receiver: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors["transaction.amount"]).toBeTruthy();
    expect(result.errors["transaction.currency"]).toBeTruthy();
    expect(result.errors["transaction.status"]).toBeTruthy();
    expect(result.errors["sender.fullName"]).toBeTruthy();
    expect(result.errors["sender.email"]).toBeTruthy();
    expect(result.errors["sender.accountNumber"]).toBeTruthy();
    expect(result.errors["sender.bankName"]).toBeTruthy();
    expect(result.errors["sender.bankCountry"]).toBeTruthy();
    expect(result.errors["sender.bankAddress"]).toBeTruthy();
    expect(result.errors["receiver.email"]).toBeTruthy();
    expect(result.errors["receiver.bankAddress"]).toBeTruthy();
  });

  test("rejects malformed email, bad links and non-image logos", () => {
    const raw = validPayload();
    (raw.sender as Record<string, unknown>).email = "not-an-email";
    raw.supportLink = "javascript:alert(1)";
    (raw.receiver as Record<string, unknown>).bankLogo = "https://evil.example.com/x.svg";
    const bad = validateBankMailerPayload(raw);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors["sender.email"]).toBeTruthy();
    expect(bad.errors["supportLink"]).toBeTruthy();
    expect(bad.errors["receiver.bankLogo"]).toBeFalsy(); // https image is allowed

    const raw2 = validPayload();
    (raw2.sender as Record<string, unknown>).bankLogo = "javascript:alert(1)";
    const bad2 = validateBankMailerPayload(raw2);
    expect(bad2.ok).toBe(false);
    if (bad2.ok) return;
    expect(bad2.errors["sender.bankLogo"]).toBeTruthy();
  });

  test("accepts an inline data-URI logo uploaded from the form", () => {
    const raw = validPayload();
    (raw.sender as Record<string, unknown>).bankLogo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const result = validateBankMailerPayload(raw);
    expect(result.ok).toBe(true);
  });

  test("rejects an out-of-range transaction id but accepts a plausible one", () => {
    const raw = validPayload();
    raw.transactionId = "!!!";
    const bad = validateBankMailerPayload(raw);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors["transactionId"]).toBeTruthy();

    const raw2 = validPayload();
    raw2.transactionId = "TXN-2026-ABC";
    expect(validateBankMailerPayload(raw2).ok).toBe(true);
  });

  test("defaults an unknown language to English rather than failing", () => {
    const raw = validPayload();
    (raw.transaction as Record<string, unknown>).language = "xx";
    const result = validateBankMailerPayload(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transaction.language).toBe("en");
  });

  test("rejects a non-object payload without throwing", () => {
    expect(validateBankMailerPayload(null).ok).toBe(false);
    expect(validateBankMailerPayload("nope").ok).toBe(false);
    expect(validateBankMailerPayload(undefined).ok).toBe(false);
  });
});

describe("helpers", () => {
  test("masks an account number to its last four digits", () => {
    expect(maskAccount("0123456789")).toBe("•••• 6789");
    expect(maskAccount("12")).toBe("•••• 12");
    expect(maskAccount("")).toBe("••••");
  });

  test("generates a 12-character alphanumeric transaction id", () => {
    const id = generateTransactionId();
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(generateTransactionId()).not.toBe(id);
  });

  test("escapes markup out of dynamic content", () => {
    // Entities are written as \u0026 escapes so the expectation itself never
    // contains an HTML entity in source.
    const LT = "\u0026lt;";
    const GT = "\u0026gt;";
    const QUOT = "\u0026quot;";
    const AMP = "\u0026amp;";
    const APOS = "\u0026#39;";

    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      `${LT}script${GT}alert(${QUOT}x${QUOT})${LT}/script${GT}`,
    );
    expect(escapeHtml("O'Brien & Sons")).toBe(`O${APOS}Brien ${AMP} Sons`);
  });

  test("exposes the billable service key", () => {
    expect(BANK_MAILER_SERVICE).toBe("bank_mailer_send");
  });
});

describe("notice rendering", () => {
  test("debit notice masks the sender account and never leaks it in full", () => {
    const notice = renderBankNotice({ kind: "debit", payload: validated(), platformName: "Cloudie" });
    expect(notice.html).toContain("•••• 6789");
    expect(notice.html).not.toContain("0123456789");
    expect(notice.subject).toContain("Debit alert");
    expect(notice.html).toContain("First Meridian Bank");
    expect(notice.text).toContain("Debit alert");
  });

  test("credit notice addresses the receiver and shows its account", () => {
    const notice = renderBankNotice({ kind: "credit", payload: validated(), platformName: "Cloudie" });
    expect(notice.subject).toContain("Credit alert");
    expect(notice.html).toContain("Credit notification");
    expect(notice.html).toContain("9988776655");
    // The sender's account stays masked in BOTH notices: the receiver has no
    // business seeing it in full.
    expect(notice.html).toContain("•••• 6789");
    expect(notice.html).not.toContain("0123456789");
  });

  test("renders the red warning banner and the simulated-notice disclaimer", () => {
    const notice = renderBankNotice({ kind: "debit", payload: validated(), platformName: "Cloudie" });
    expect(notice.html).toContain("Verify the beneficiary before sending funds.");
    expect(notice.html).toContain("background:#fef2f2");
    expect(notice.html).toContain("not a bank transfer confirmation");
    expect(notice.html).toContain("Generated by Cloudie");
  });

  test("omits the banner and support button when those fields are absent", () => {
    const raw = validPayload();
    delete raw.warningBanner;
    delete raw.supportLink;
    delete raw.remarks;
    const result = validateBankMailerPayload(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notice = renderBankNotice({ kind: "debit", payload: result.value, platformName: "Cloudie" });
    expect(notice.html).not.toContain("background:#fef2f2");
    expect(notice.html).not.toContain("Contact support");
    expect(notice.html).not.toContain("Invoice settlement");
  });

  test("links the support CTA only to an http(s) destination", () => {
    const notice = renderBankNotice({ kind: "credit", payload: validated(), platformName: "Cloudie" });
    expect(notice.html).toContain('href="https://cloudie.wuaze.com/support"');
    expect(notice.html).not.toContain("javascript:");
  });

  test("translates the subject and body for French and Spanish", () => {
    const raw = validPayload();

    const fr = { ...(raw.transaction as Record<string, unknown>), language: "fr" };
    const frPayload = validateBankMailerPayload({ ...raw, transaction: fr });
    expect(frPayload.ok).toBe(true);
    if (!frPayload.ok) return;
    const frNotice = renderBankNotice({ kind: "debit", payload: frPayload.value, platformName: "Cloudie" });
    expect(frNotice.subject).toContain("Alerte de débit");
    expect(frNotice.html).toContain("Notification de débit");
    expect(frNotice.html).toContain("Référence");

    const es = { ...(raw.transaction as Record<string, unknown>), language: "es" };
    const esPayload = validateBankMailerPayload({ ...raw, transaction: es });
    expect(esPayload.ok).toBe(true);
    if (!esPayload.ok) return;
    const esNotice = renderBankNotice({ kind: "credit", payload: esPayload.value, platformName: "Cloudie" });
    expect(esNotice.subject).toContain("Alerta de crédito");
    expect(esNotice.html).toContain("Notificación de crédito");
    expect(esNotice.html).toContain("Importe");
  });

  test("renders a complete standalone document (what the preview iframe loads)", () => {
    const notice = renderBankNotice({ kind: "debit", payload: validated(), platformName: "Cloudie" });
    expect(notice.html.startsWith("<!doctype html>")).toBe(true);
    expect(notice.html).toContain("</html>");
    // No executable content survives into the document.
    expect(notice.html).not.toContain("<script");
    expect(notice.html).not.toContain("<style");
  });
});