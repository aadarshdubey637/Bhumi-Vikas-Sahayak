// Holds the access key in module memory only. localStorage is never used.
// sessionStorage is used solely when the user ticks "Keep me signed in for this tab".

const SESSION_KEY = "ns_access_key";
type Listener = () => void;

let key: string | null = null;
let authOpen = false; // an authenticated call succeeded without any key => auth is disabled (dev)
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function readSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export const keyStore = {
  getKey(): string | null {
    if (key === null) {
      const stored = readSession();
      if (stored) key = stored;
    }
    return key;
  },
  setKey(value: string, persistForTab: boolean) {
    key = value;
    authOpen = false;
    try {
      if (persistForTab) window.sessionStorage.setItem(SESSION_KEY, value);
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable: memory only */
    }
    emit();
  },
  clear() {
    key = null;
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    emit();
  },
  /** Called by the client after an authenticated request succeeded with no key attached. */
  markAuthOpen() {
    if (!authOpen && key === null) {
      authOpen = true;
      emit();
    }
  },
  isAuthOpen(): boolean {
    return authOpen;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
