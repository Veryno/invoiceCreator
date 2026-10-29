"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const SETTINGS_FILE_NAME = "email-settings.json";
const MAX_RECIPIENTS = 20;
const MAX_SUBJECT_LENGTH = 400;
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/u;

/**
 * Known SMTP servers. Gmail, Yahoo, and iCloud need an app password created in
 * the account's security settings; the regular sign-in password is rejected.
 */
const PROVIDERS = Object.freeze({
  gmail: { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { label: "Outlook.com / Hotmail", host: "smtp-mail.outlook.com", port: 587, secure: false },
  office365: { label: "Microsoft 365", host: "smtp.office365.com", port: 587, secure: false },
  yahoo: { label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 465, secure: true },
  icloud: { label: "iCloud Mail", host: "smtp.mail.me.com", port: 587, secure: false },
  custom: { label: "Other (SMTP)", host: "", port: 587, secure: false },
});

class EmailSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmailSetupError";
    this.code = "EMAIL_NOT_CONFIGURED";
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, maximum) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maximum);
}

function cleanHeader(value, maximum) {
  return cleanText(value, maximum).replace(/[\r\n]+/g, " ");
}

function isEmail(value) {
  return typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** Splits "a@x.com, b@y.com; c@z.com" into validated addresses. */
function parseRecipients(value, label, { required = true } = {}) {
  const list = (Array.isArray(value) ? value.join(",") : String(value ?? ""))
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!list.length && required) throw new TypeError(`Enter at least one ${label} email address.`);
  if (list.length > MAX_RECIPIENTS) throw new RangeError(`Use ${MAX_RECIPIENTS} or fewer ${label} addresses.`);
  const invalid = list.find((entry) => !isEmail(entry));
  if (invalid) throw new TypeError(`“${invalid.slice(0, 80)}” is not a valid email address.`);
  return [...new Set(list.map((entry) => entry.toLowerCase()))];
}

function normalizeSettings(value) {
  const source = isRecord(value) ? value : {};
  const provider = Object.hasOwn(PROVIDERS, source.provider) ? source.provider : "gmail";
  const preset = PROVIDERS[provider];
  const port = Number.parseInt(source.port, 10);
  return {
    provider,
    host: provider === "custom" ? cleanHeader(source.host, 253) : preset.host,
    port: provider === "custom" && port > 0 && port < 65536 ? port : preset.port,
    secure: provider === "custom" ? source.secure === true : preset.secure,
    username: cleanHeader(source.username, 254),
    fromName: cleanHeader(source.fromName, 120),
    fromAddress: cleanHeader(source.fromAddress, 254),
  };
}

function createEmailService({ directoryPath, safeStorage, createTransport }) {
  const settingsPath = path.join(directoryPath, SETTINGS_FILE_NAME);
  let cache = null;
  let sessionPassword = "";

  function canEncrypt() {
    try {
      return Boolean(safeStorage?.isEncryptionAvailable?.());
    } catch {
      return false;
    }
  }

  async function read() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      cache = {
        settings: normalizeSettings(parsed.settings),
        encryptedPassword: typeof parsed.encryptedPassword === "string" ? parsed.encryptedPassword : "",
      };
    } catch (error) {
      if (error?.code !== "ENOENT") console.error("Unable to read email settings:", error);
      cache = { settings: normalizeSettings({}), encryptedPassword: "" };
    }
    return cache;
  }

  async function write(next) {
    const temporaryPath = `${settingsPath}.${process.pid}-${crypto.randomUUID()}.tmp`;
    await fs.mkdir(directoryPath, { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryPath, settingsPath);
    cache = next;
  }

  async function password() {
    const stored = await read();
    if (stored.encryptedPassword && canEncrypt()) {
      try {
        return safeStorage.decryptString(Buffer.from(stored.encryptedPassword, "base64"));
      } catch (error) {
        console.error("Unable to decrypt the saved email password:", error);
      }
    }
    return sessionPassword;
  }

  async function getSettings() {
    const stored = await read();
    const hasPassword = Boolean(stored.encryptedPassword || sessionPassword);
    return {
      settings: stored.settings,
      hasPassword,
      passwordPersisted: Boolean(stored.encryptedPassword),
      canPersistPassword: canEncrypt(),
      configured: Boolean(stored.settings.host && stored.settings.username && hasPassword),
      providers: Object.entries(PROVIDERS).map(([id, preset]) => ({ id, ...preset })),
    };
  }

  /** Saves server settings. `password` undefined keeps the current one; "" clears it. */
  async function saveSettings(input) {
    if (!isRecord(input)) throw new TypeError("Email settings must be an object.");
    const stored = await read();
    const settings = normalizeSettings({ ...stored.settings, ...(isRecord(input.settings) ? input.settings : {}) });
    if (settings.username && !isEmail(settings.username) && settings.provider !== "custom") {
      throw new TypeError("Enter the full email address you sign in with.");
    }
    if (settings.fromAddress && !isEmail(settings.fromAddress)) {
      throw new TypeError("The from address is not a valid email address.");
    }
    let encryptedPassword = stored.encryptedPassword;
    if (typeof input.password === "string") {
      // Google shows app passwords in groups of four separated by spaces.
      const nextPassword = settings.provider === "gmail"
        ? input.password.replace(/\s+/g, "")
        : input.password;
      if (!nextPassword) {
        encryptedPassword = "";
        sessionPassword = "";
      } else if (canEncrypt()) {
        encryptedPassword = safeStorage.encryptString(nextPassword).toString("base64");
        sessionPassword = "";
      } else {
        encryptedPassword = "";
        sessionPassword = nextPassword;
      }
    }
    await write({ settings, encryptedPassword });
    return getSettings();
  }

  async function transport() {
    const { settings } = await read();
    const secret = await password();
    if (!settings.host || !settings.username || !secret) {
      throw new EmailSetupError("Set up email in Settings → Email before sending.");
    }
    return {
      settings,
      transporter: createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        requireTLS: !settings.secure,
        auth: { user: settings.username, pass: secret },
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 60_000,
      }),
    };
  }

  function friendlyError(error) {
    const text = String(error?.response || error?.message || "");
    if (error?.code === "EAUTH" || /535|534|auth/i.test(text)) {
      return new Error("The email server rejected the sign-in. Check the address and app password in Settings → Email.");
    }
    if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(error?.code)) {
      return new Error("Couldn’t reach the email server. Check your internet connection and the server settings.");
    }
    return error instanceof Error ? error : new Error(text || "The email could not be sent.");
  }

  async function verify() {
    const { transporter } = await transport();
    try {
      await transporter.verify();
      return { ok: true };
    } catch (error) {
      throw friendlyError(error);
    } finally {
      transporter.close?.();
    }
  }

  async function send({ to, cc, subject, message, attachment }) {
    const recipients = parseRecipients(to, "recipient");
    const copies = parseRecipients(cc, "Cc", { required: false });
    const cleanSubject = cleanHeader(subject, MAX_SUBJECT_LENGTH);
    if (!cleanSubject) throw new TypeError("Add a subject line.");
    const text = cleanText(message, MAX_MESSAGE_LENGTH);
    if (!Buffer.isBuffer(attachment?.content) || attachment.content.length > MAX_ATTACHMENT_BYTES) {
      throw new TypeError("The invoice PDF could not be attached.");
    }
    const { settings, transporter } = await transport();
    const fromAddress = settings.fromAddress || settings.username;
    try {
      const info = await transporter.sendMail({
        from: settings.fromName ? { name: settings.fromName, address: fromAddress } : fromAddress,
        to: recipients,
        ...(copies.length ? { cc: copies } : {}),
        replyTo: fromAddress,
        subject: cleanSubject,
        text,
        attachments: [{
          filename: cleanHeader(attachment.filename, 180) || "invoice.pdf",
          content: attachment.content,
          contentType: "application/pdf",
        }],
      });
      return { ok: true, accepted: info.accepted?.map(String) || recipients, messageId: info.messageId || null };
    } catch (error) {
      throw friendlyError(error);
    } finally {
      transporter.close?.();
    }
  }

  return { getSettings, saveSettings, verify, send, parseRecipients };
}

module.exports = {
  EmailSetupError,
  PROVIDERS,
  createEmailService,
  parseRecipients,
};
