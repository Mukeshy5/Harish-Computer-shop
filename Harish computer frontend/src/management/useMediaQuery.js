import { useCallback, useMemo, useSyncExternalStore } from "react";

export function useMediaQuery(query) {
  const media = useMemo(() => window.matchMedia(query), [query]);
  const subscribe = useCallback(
    (listener) => {
      if (media.addEventListener) {
        media.addEventListener("change", listener);
        return () => media.removeEventListener("change", listener);
      }
      media.addListener(listener);
      return () => media.removeListener(listener);
    },
    [media],
  );
  return useSyncExternalStore(
    subscribe,
    () => media.matches,
    () => false,
  );
}
