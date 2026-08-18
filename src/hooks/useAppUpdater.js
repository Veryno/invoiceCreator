import { useCallback, useEffect, useState } from "react";

const browserState = {
  status: "development",
  currentVersion: null,
  availableVersion: null,
  percent: null,
  lastCheckedAt: null,
  errorMessage: null,
};

export function useAppUpdater() {
  const [state, setState] = useState(browserState);
  const desktop = window.invoiceDesktop;

  useEffect(() => {
    if (!desktop?.getUpdateState) return undefined;

    let active = true;
    desktop.getUpdateState()
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, status: "error", errorMessage: "The update service could not start." }));
      });

    const unsubscribe = desktop.onUpdateState?.((nextState) => {
      if (active) setState(nextState);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [desktop]);

  const checkForUpdates = useCallback(async () => {
    if (!desktop?.checkForUpdates) return browserState;
    return desktop.checkForUpdates();
  }, [desktop]);

  const downloadUpdate = useCallback(async () => {
    if (!desktop?.downloadUpdate) return browserState;
    return desktop.downloadUpdate();
  }, [desktop]);

  const restartAndInstall = useCallback(async () => {
    if (!desktop?.restartAndInstall) return { accepted: false };
    return desktop.restartAndInstall();
  }, [desktop]);

  return { state, checkForUpdates, downloadUpdate, restartAndInstall };
}
