// Tiny bridge between the application header and the Workbench page: the header's Reset and History buttons act on the workbench.
export type WbCommand = "reset" | "history";
const EVENT = "ns:wb-command";

export const sendWbCommand = (cmd: WbCommand): void => {
  window.dispatchEvent(new CustomEvent<WbCommand>(EVENT, { detail: cmd }));
};

export function onWbCommand(handler: (cmd: WbCommand) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<WbCommand>).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
