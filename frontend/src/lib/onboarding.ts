// First-run tour state. Signed-in users: stored on their account (so it follows them across devices). Visitors: one harmless flag in
// this browser. "Skip" and "Done" both count as seen; the tour can be opened again from the header and the dashboard.
const KEY = "ns.onboarded";
const listeners = new Set<() => void>();

export const guestOnboardingSeen = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage blocked: do not nag on every page load
  }
};
export const markGuestOnboardingSeen = (): void => {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
};
export const clearGuestOnboarding = (): void => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

/** Ask the mounted tour host to open (header help button, dashboard card). */
export const openOnboarding = (): void => listeners.forEach((l) => l());
export const onOpenOnboarding = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
