import { useSyncExternalStore } from "react";

export const PORTAL_HOST_ID = "ui-portal-host";

const neverChanges = () => () => {};

export const usePortalHost = (): HTMLElement | null =>
  useSyncExternalStore(
    neverChanges,
    () => document.getElementById(PORTAL_HOST_ID),
    () => null
  );
