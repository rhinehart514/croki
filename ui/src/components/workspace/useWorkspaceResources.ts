import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCredentials,
  getCapabilityInventory,
  getSystemIndex,
  getWorkIndex,
  listVentures,
  type FirmVenture,
  type FounderCredential,
  type RuntimeCapabilityInventoryItem,
  type SystemIndex,
  type WorkIndex,
} from "@/api";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import type { WorkspaceMode } from "@/lib/venture-session";

export type WorkspaceResource<T> = {
  data: T | null;
  status: "loading" | "ready" | "stale" | "error";
  error: string | null;
};

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function readyWorkspaceResource<T>(data: T): WorkspaceResource<T> {
  return { data, status: "ready", error: null };
}

export function failedWorkspaceResource<T>(
  current: WorkspaceResource<T>,
  error: unknown,
): WorkspaceResource<T> {
  return {
    ...current,
    status: current.data == null ? "error" : "stale",
    error: messageOf(error, "This workspace resource could not be refreshed."),
  };
}

function useLoadedResource<T>(initial: T | null = null) {
  const [resource, setResource] = useState<WorkspaceResource<T>>({
    data: initial,
    status: initial == null ? "loading" : "ready",
    error: null,
  });
  const load = useCallback(async (loader: () => Promise<T>) => {
    setResource((current) => current.data == null ? { ...current, status: "loading", error: null } : current);
    try {
      const data = await loader();
      setResource(readyWorkspaceResource(data));
      return data;
    } catch (error) {
      setResource((current) => failedWorkspaceResource(current, error));
      return null;
    }
  }, []);
  const setData = useCallback((data: T | null) => {
    setResource({ data, status: data == null ? "loading" : "ready", error: null });
  }, []);
  return { resource, load, setData };
}

export function useWorkspaceResources({
  venture,
  mode,
  search,
  settingsConnection,
}: {
  venture: FirmVenture;
  mode: WorkspaceMode;
  search: string;
  settingsConnection: "gmail" | null | undefined;
}) {
  const firm = useFirmConnection(venture.id);
  const { resource: systemResource, load: loadSystem, setData: setSystemIndex } = useLoadedResource<SystemIndex>();
  const [searchWork, setSearchWork] = useState<WorkIndex | null>(null);
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const [credentials, setCredentials] = useState<FounderCredential[]>([]);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilityInventoryItem[]>([]);

  const reloadSystem = useCallback(
    () => loadSystem(async () => (await getSystemIndex(venture.id, "system", "")).systemIndex),
    [loadSystem, venture.id],
  );

  useEffect(() => {
    void listVentures().then((value) => setVentures(value.ventures)).catch(() => setVentures([venture]));
  }, [venture]);
  useEffect(() => {
    void getCredentials().then((value) => setCredentials(value.credentials)).catch(() => setCredentials([]));
    void getCapabilityInventory().then((value) => setCapabilities(value.capabilities)).catch(() => setCapabilities([]));
  }, [settingsConnection]);
  useEffect(() => {
    void reloadSystem();
  }, [firm.workIndex?.revision, reloadSystem]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mode !== "work" || !search.trim()) setSearchWork(null);
      else void getWorkIndex(venture.id, search)
        .then((value) => setSearchWork(value.workIndex))
        .catch(() => setSearchWork(null));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mode, search, venture.id]);

  const connectionResource = useCallback(<T,>(data: T | null): WorkspaceResource<T> => {
    const degraded = ["stale", "offline", "read-only"].includes(firm.connection.phase);
    return {
      data,
      status: data == null ? (degraded ? "error" : "loading") : (degraded ? "stale" : "ready"),
      error: degraded ? (firm.connection.message ?? "Croki could not refresh this local resource.") : null,
    };
  }, [firm.connection.message, firm.connection.phase]);

  return useMemo(() => ({
    ...firm,
    lensResource: connectionResource(firm.lens),
    workIndexResource: connectionResource(firm.workIndex),
    systemResource,
    setSystemIndex,
    reloadSystem,
    searchWork,
    ventures,
    credentials,
    capabilities,
  }), [connectionResource, credentials, firm, reloadSystem, searchWork,
    setSystemIndex, systemResource, ventures, capabilities]);
}
