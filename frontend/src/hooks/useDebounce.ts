import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return v;
}
