import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  LOGO_ASSET_REF_PREFIX,
  MAX_LOGO_ASSET_BYTES,
  compactWorkspaceLogoAssets,
  createInvoiceInWorkspace,
  createWorkspace,
  hydrateWorkspaceLogoAssets,
  normalizeWorkspace,
} from "../src/lib/workspace.js";
import { createWorkspaceRepository } from "../src/lib/workspaceRepository.js";

const require = createRequire(import.meta.url);
const { MAX_WORKSPACE_BYTES, serializeAndValidateWorkspace } = require("../electron/workspace-store.cjs");

const TIMESTAMP = "2026-08-19T12:00:00.000Z";

function smallLogo(label) {
  return `data:image/png;base64,${Buffer.from(label).toString("base64")}`;
}

function makeRawLogoWorkspace(logo) {
  let workspace = normalizeWorkspace({
    ...createWorkspace({ now: TIMESTAMP }),
    profile: {
      ...createWorkspace({ now: TIMESTAMP }).profile,
      company: { name: "Logo Studio", logo },
    },
  }, { now: TIMESTAMP });
  workspace = createInvoiceInWorkspace(workspace, {}, {
    now: TIMESTAMP,
    id: "invoice:logo-migration",
  }).workspace;
  return workspace;
}

function makeDesktopBridge(initial) {
  let stored = structuredClone(initial);
  let saveCalls = 0;
  return {
    async getWorkspace() {
      return { workspace: structuredClone(stored), isNew: false, recoveredFromBackup: false };
    },
    async saveWorkspace({ workspace, expectedRevision }) {
      assert.equal(expectedRevision, stored.revision);
      serializeAndValidateWorkspace(workspace);
      const candidate = structuredClone(workspace);
      candidate.revision = stored.revision + 1;
      candidate.installId = stored.installId;
      candidate.createdAt = stored.createdAt;
      candidate.updatedAt = TIMESTAMP;
      stored = candidate;
      saveCalls += 1;
      return structuredClone(stored);
    },
    async flushWorkspace() {
      return { revision: stored.revision };
    },
    inspect() {
      return { saveCalls, stored: structuredClone(stored) };
    },
  };
}

function makeStorage(initialWorkspace) {
  const values = new Map();
  if (initialWorkspace) {
    values.set("invoice-studio:workspace:v1", JSON.stringify(initialWorkspace));
  }
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    readWorkspace() {
      return JSON.parse(values.get("invoice-studio:workspace:v1"));
    },
  };
}

test("logo compaction preserves historical document logos and prunes unused assets", () => {
  const firstLogo = smallLogo("first logo");
  const secondLogo = smallLogo("second logo");
  let workspace = makeRawLogoWorkspace(firstLogo);
  workspace = normalizeWorkspace({
    ...workspace,
    profile: {
      ...workspace.profile,
      company: { ...workspace.profile.company, logo: secondLogo },
    },
  }, { now: TIMESTAMP });
  workspace = createInvoiceInWorkspace(workspace, {}, {
    now: TIMESTAMP,
    id: "invoice:second-logo",
  }).workspace;

  const compacted = compactWorkspaceLogoAssets(workspace, { now: TIMESTAMP });
  assert.equal(compacted.changed, true);
  assert.equal(compacted.workspace.assets.logos.length, 2);
  assert.ok(compacted.workspace.profile.company.logo.startsWith(LOGO_ASSET_REF_PREFIX));
  assert.ok(compacted.workspace.invoices.every(({ invoice }) => (
    invoice.company.logo.startsWith(LOGO_ASSET_REF_PREFIX)
  )));
  const serialized = JSON.stringify(compacted.workspace);
  assert.equal(serialized.split(firstLogo).length - 1, 1);
  assert.equal(serialized.split(secondLogo).length - 1, 1);

  const hydrated = hydrateWorkspaceLogoAssets(compacted.workspace, { now: TIMESTAMP });
  assert.equal(hydrated.profile.company.logo, secondLogo);
  assert.equal(hydrated.invoices[0].invoice.company.logo, firstLogo);
  assert.equal(hydrated.invoices[1].invoice.company.logo, secondLogo);

  const withUnusedAsset = {
    ...compacted.workspace,
    assets: {
      logos: [
        ...compacted.workspace.assets.logos,
        { id: "logo:unused", dataUrl: smallLogo("unused") },
      ],
    },
  };
  const pruned = compactWorkspaceLogoAssets(withUnusedAsset, { now: TIMESTAMP });
  assert.equal(pruned.changed, true);
  assert.equal(pruned.workspace.assets.logos.length, 2);
  assert.equal(pruned.workspace.assets.logos.some(({ id }) => id === "logo:unused"), false);
});

test("logo compaction rejects malformed and oversized embedded image data", () => {
  const malformed = compactWorkspaceLogoAssets(
    makeRawLogoWorkspace("data:image/png;base64,not valid!"),
    { now: TIMESTAMP },
  );
  assert.equal(malformed.changed, true);
  assert.equal(malformed.workspace.profile.company.logo, "");
  assert.equal(malformed.workspace.invoices[0].invoice.company.logo, "");
  assert.deepEqual(malformed.workspace.assets.logos, []);

  const oversizedPayload = "AAAA".repeat(Math.ceil((MAX_LOGO_ASSET_BYTES + 1) / 3));
  const oversized = compactWorkspaceLogoAssets(
    makeRawLogoWorkspace(`data:image/webp;base64,${oversizedPayload}`),
    { now: TIMESTAMP },
  );
  assert.equal(oversized.workspace.profile.company.logo, "");
  assert.equal(oversized.workspace.invoices[0].invoice.company.logo, "");
  assert.deepEqual(oversized.workspace.assets.logos, []);
});

test("desktop repository migrates raw logos while keeping all UI contracts hydrated", async () => {
  const logo = smallLogo("desktop migration");
  const bridge = makeDesktopBridge(makeRawLogoWorkspace(logo));
  const repository = createWorkspaceRepository({ bridge, storage: makeStorage() });
  const events = [];
  repository.subscribe((workspace) => events.push(workspace.profile.company.logo));

  const loaded = await repository.load();
  assert.equal(loaded.profile.company.logo, logo);
  assert.equal(loaded.invoices[0].invoice.company.logo, logo);
  assert.deepEqual(events, [logo]);
  assert.equal(bridge.inspect().saveCalls, 1);
  assert.equal(bridge.inspect().stored.assets.logos.length, 1);
  assert.ok(bridge.inspect().stored.profile.company.logo.startsWith(LOGO_ASSET_REF_PREFIX));
  assert.ok(repository.getSnapshot().profile.company.logo.startsWith(LOGO_ASSET_REF_PREFIX));

  const reopened = createWorkspaceRepository({ bridge, storage: makeStorage() });
  const reloaded = await reopened.load();
  assert.equal(reloaded.profile.company.logo, logo);
  assert.equal(bridge.inspect().saveCalls, 1);
});

test("browser fallback migrates raw logos once and stores only one data copy", async () => {
  const logo = smallLogo("browser migration");
  const storage = makeStorage(makeRawLogoWorkspace(logo));
  const repository = createWorkspaceRepository({
    bridge: null,
    indexedDB: null,
    storage,
  });
  const loaded = await repository.load();
  const persisted = storage.readWorkspace();

  assert.equal(loaded.profile.company.logo, logo);
  assert.equal(loaded.invoices[0].invoice.company.logo, logo);
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.assets.logos.length, 1);
  assert.ok(persisted.profile.company.logo.startsWith(LOGO_ASSET_REF_PREFIX));
  assert.equal(JSON.stringify(persisted).split(logo).length - 1, 1);

  const reopened = createWorkspaceRepository({ bridge: null, indexedDB: null, storage });
  const reloaded = await reopened.load();
  assert.equal(reloaded.profile.company.logo, logo);
  assert.equal(storage.readWorkspace().revision, 1);
});

test("one maximum-size logo remains one bounded desktop asset across many invoices", async () => {
  const logo = `data:image/png;base64,${Buffer.alloc(MAX_LOGO_ASSET_BYTES).toString("base64")}`;
  const bridge = makeDesktopBridge(createWorkspace({ now: TIMESTAMP }));
  const repository = createWorkspaceRepository({ bridge, storage: makeStorage() });
  await repository.load();
  await repository.update((workspace) => normalizeWorkspace({
    ...workspace,
    profile: {
      ...workspace.profile,
      company: { ...workspace.profile.company, logo },
    },
  }, { now: TIMESTAMP }));

  const returned = await repository.update((workspace) => {
    assert.equal(workspace.profile.company.logo, logo);
    let next = workspace;
    for (let index = 0; index < 100; index += 1) {
      next = createInvoiceInWorkspace(next, {}, {
        now: TIMESTAMP,
        id: `invoice:max-logo-${index}`,
      }).workspace;
    }
    return next;
  });

  const stored = bridge.inspect().stored;
  const serialized = serializeAndValidateWorkspace(stored);
  assert.equal(returned.invoices.length, 100);
  assert.ok(returned.invoices.every(({ invoice }) => invoice.company.logo === logo));
  assert.equal(stored.assets.logos.length, 1);
  assert.ok(stored.invoices.every(({ invoice }) => (
    invoice.company.logo === stored.profile.company.logo
    && invoice.company.logo.startsWith(LOGO_ASSET_REF_PREFIX)
  )));
  assert.equal(serialized.split(logo).length - 1, 1);
  assert.ok(Buffer.byteLength(serialized) < MAX_WORKSPACE_BYTES);
});
