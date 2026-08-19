import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  WORKSPACE_COLLECTIONS,
  archiveWorkspaceRecord,
  createInvoiceInWorkspace,
  normalizeWorkspace,
  setWorkspaceOnboarding,
  upsertWorkspaceRecord,
} from "../lib/workspace.js";
import { createWorkspaceRepository } from "../lib/workspaceRepository.js";

const WorkspaceContext = createContext(null);

function mergeProfile(workspace, patch) {
  const source = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  const company = source.company && typeof source.company === "object" ? source.company : {};
  const defaults = source.defaults && typeof source.defaults === "object" ? source.defaults : {};
  return normalizeWorkspace({
    ...workspace,
    profile: {
      company: { ...workspace.profile.company, ...company },
      defaults: {
        ...workspace.profile.defaults,
        ...defaults,
        content: { ...workspace.profile.defaults.content, ...defaults.content },
        design: { ...workspace.profile.defaults.design, ...defaults.design },
      },
    },
  });
}

/**
 * Owns one versioned workspace repository and exposes ordered, persistence-backed
 * commands. Pages consume this provider instead of writing localStorage or IPC
 * directly.
 */
export function WorkspaceProvider({ children, repository: providedRepository, repositoryOptions }) {
  const [repository] = useState(
    () => providedRepository || createWorkspaceRepository(repositoryOptions),
  );
  const [workspace, setWorkspace] = useState(null);
  const [status, setStatus] = useState("loading");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = repository.subscribe((snapshot) => {
      if (active) setWorkspace(snapshot);
    });
    repository.load()
      .then((snapshot) => {
        if (!active) return;
        setWorkspace(snapshot);
        setSavedAt(new Date(snapshot.updatedAt));
        setStatus("ready");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError);
        setStatus("error");
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  useEffect(() => {
    const flushBeforeUnload = () => {
      void repository.flush();
    };
    globalThis.addEventListener?.("beforeunload", flushBeforeUnload);
    return () => globalThis.removeEventListener?.("beforeunload", flushBeforeUnload);
  }, [repository]);

  const update = useCallback(async (updater) => {
    setSaveStatus("saving");
    setError(null);
    try {
      const snapshot = await repository.update(updater);
      setWorkspace(snapshot);
      setSavedAt(new Date(snapshot.updatedAt));
      setSaveStatus("saved");
      return snapshot;
    } catch (updateError) {
      setError(updateError);
      setSaveStatus("error");
      throw updateError;
    }
  }, [repository]);

  const createInvoice = useCallback(async (invoice, options = {}) => {
    let createdRecord = null;
    const snapshot = await update((current) => {
      const result = createInvoiceInWorkspace(current, invoice, options);
      createdRecord = result.record;
      return result.workspace;
    });
    return { workspace: snapshot, record: createdRecord };
  }, [update]);

  const saveRecord = useCallback(async (collection, record) => {
    if (!WORKSPACE_COLLECTIONS.includes(collection)) {
      throw new TypeError(`Unknown workspace collection: ${String(collection)}`);
    }
    let savedRecord = null;
    const snapshot = await update((current) => {
      const result = upsertWorkspaceRecord(current, collection, record);
      savedRecord = result.record;
      return result.workspace;
    });
    return { workspace: snapshot, record: savedRecord };
  }, [update]);

  const saveInvoice = useCallback(async (id, invoice, links = {}) => {
    let savedRecord = null;
    const snapshot = await update((current) => {
      const existing = current.invoices.find((record) => record.id === id);
      if (!existing) throw new Error("Invoice record was not found.");
      const result = upsertWorkspaceRecord(current, "invoices", {
        ...existing,
        ...links,
        id,
        invoice,
      });
      savedRecord = result.record;
      return result.workspace;
    });
    return { workspace: snapshot, record: savedRecord };
  }, [update]);

  const archiveRecord = useCallback(
    (collection, id) => update((current) => archiveWorkspaceRecord(current, collection, id)),
    [update],
  );

  const setActiveInvoice = useCallback((id) => update((current) => {
    const exists = current.invoices.some((record) => record.id === id && !record.archivedAt);
    if (!exists) throw new Error("Invoice record was not found.");
    return normalizeWorkspace({
      ...current,
      preferences: { ...current.preferences, activeInvoiceId: id },
    });
  }), [update]);

  const updateProfile = useCallback(
    (patch) => update((current) => mergeProfile(current, patch)),
    [update],
  );

  const updatePreferences = useCallback((patch) => update((current) => normalizeWorkspace({
    ...current,
    preferences: {
      ...current.preferences,
      ...(patch && typeof patch === "object" ? patch : {}),
      numbering: {
        ...current.preferences.numbering,
        ...(patch?.numbering && typeof patch.numbering === "object" ? patch.numbering : {}),
      },
      onboarding: current.preferences.onboarding,
    },
  })), [update]);

  const updateOnboarding = useCallback(
    (patch) => update((current) => setWorkspaceOnboarding(current, patch)),
    [update],
  );

  const replaceWorkspace = useCallback(async (nextWorkspace) => {
    if (!workspace) throw new Error("The workspace is still loading.");
    setSaveStatus("saving");
    try {
      const snapshot = await repository.save(normalizeWorkspace(nextWorkspace), {
        expectedRevision: workspace.revision,
      });
      setWorkspace(snapshot);
      setSavedAt(new Date(snapshot.updatedAt));
      setSaveStatus("saved");
      return snapshot;
    } catch (replaceError) {
      setError(replaceError);
      setSaveStatus("error");
      throw replaceError;
    }
  }, [repository, workspace]);

  const flush = useCallback(() => repository.flush(), [repository]);
  const getSnapshot = useCallback(() => repository.getSnapshot(), [repository]);

  const activeInvoiceRecord = useMemo(
    () => workspace?.invoices.find(({ id }) => id === workspace.preferences.activeInvoiceId) || null,
    [workspace],
  );

  const value = useMemo(() => ({
    activeInvoice: activeInvoiceRecord?.invoice || null,
    activeInvoiceRecord,
    archiveRecord,
    createInvoice,
    error,
    flush,
    getSnapshot,
    metadata: repository.getMetadata(),
    replaceWorkspace,
    repositoryKind: repository.kind,
    saveInvoice,
    saveRecord,
    savedAt,
    saveStatus,
    setActiveInvoice,
    status,
    update,
    updateOnboarding,
    updatePreferences,
    updateProfile,
    workspace,
  }), [
    activeInvoiceRecord,
    archiveRecord,
    createInvoice,
    error,
    flush,
    getSnapshot,
    replaceWorkspace,
    repository,
    saveInvoice,
    saveRecord,
    savedAt,
    saveStatus,
    setActiveInvoice,
    status,
    update,
    updateOnboarding,
    updatePreferences,
    updateProfile,
    workspace,
  ]);

  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider.");
  }
  return context;
}

export function useOptionalWorkspace() {
  return useContext(WorkspaceContext);
}
