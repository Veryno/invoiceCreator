import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import emailService from "../electron/email-service.cjs";
import { emailFingerprint, fillEmailTemplate } from "../src/lib/email.js";
import { createDefaultInvoice } from "../src/lib/invoice.js";

const { createEmailService, parseRecipients } = emailService;

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`enc:${value}`),
  decryptString: (buffer) => buffer.toString().replace(/^enc:/, ""),
};

async function withService(run) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-email-"));
  const sent = [];
  const transportOptions = [];
  try {
    const service = createEmailService({
      directoryPath,
      safeStorage: fakeSafeStorage,
      createTransport: (options) => {
        transportOptions.push(options);
        return {
          verify: async () => true,
          sendMail: async (message) => {
            sent.push(message);
            return { accepted: message.to, messageId: "<test@local>" };
          },
          close() {},
        };
      },
    });
    await run({ service, sent, transportOptions, directoryPath });
  } finally {
    await fs.rm(directoryPath, { recursive: true, force: true });
  }
}

test("parses and validates recipient lists", () => {
  assert.deepEqual(parseRecipients("A@x.com, b@y.com; a@x.com", "recipient"), ["a@x.com", "b@y.com"]);
  assert.throws(() => parseRecipients("not-an-email", "recipient"), /not a valid email/);
  assert.throws(() => parseRecipients("", "recipient"), /at least one/);
  assert.deepEqual(parseRecipients("", "Cc", { required: false }), []);
});

test("stores the password encrypted and never returns it", async () => {
  await withService(async ({ service, directoryPath }) => {
    const result = await service.saveSettings({
      settings: { provider: "gmail", username: "owner@example.com", fromName: "REEM Construction" },
      password: "abcd efgh ijkl mnop",
    });
    assert.equal(result.configured, true);
    assert.equal(result.settings.host, "smtp.gmail.com");
    assert.equal(JSON.stringify(result).includes("abcd"), false);
    const file = await fs.readFile(path.join(directoryPath, "email-settings.json"), "utf8");
    assert.equal(file.includes("abcdefghijklmnop"), false);
  });
});

test("sends the invoice PDF from the connected account", async () => {
  await withService(async ({ service, sent, transportOptions }) => {
    await service.saveSettings({
      settings: { provider: "gmail", username: "owner@example.com", fromName: "REEM" },
      password: "abcd efgh ijkl mnop",
    });
    await service.send({
      to: "client@example.com",
      cc: "",
      subject: "Invoice 1001\r\nBcc: attacker@example.com",
      message: "Hello",
      attachment: { filename: "Invoice-1001.pdf", content: Buffer.from("%PDF-1.7") },
    });
    assert.equal(transportOptions[0].auth.pass, "abcdefghijklmnop");
    assert.deepEqual(sent[0].to, ["client@example.com"]);
    assert.equal(sent[0].subject.includes("\n"), false);
    assert.equal(sent[0].attachments[0].contentType, "application/pdf");
  });
});

test("refuses to send before email is set up", async () => {
  await withService(async ({ service }) => {
    await assert.rejects(
      service.send({ to: "client@example.com", subject: "Hi", message: "", attachment: { content: Buffer.from("x") } }),
      /Set up email/,
    );
  });
});

test("fills message placeholders from the invoice", () => {
  const invoice = createDefaultInvoice();
  const text = fillEmailTemplate("{number} for {job}: {balance} {unknown}", invoice);
  assert.match(text, /^INV-\d{4}-001 for Unit 4B kitchen remodel: \$9,019\.65 \{unknown\}$/);
  const changed = { ...invoice, meta: { ...invoice.meta, number: "X" } };
  assert.notEqual(emailFingerprint({ invoice, subject: "a", message: "b" }), emailFingerprint({ invoice: changed, subject: "a", message: "b" }));
});
