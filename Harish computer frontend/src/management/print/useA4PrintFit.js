import { useEffect, useRef } from "react";

// CSS zoom changes pagination as well as appearance; transform alone does not.
export function useA4PrintFit(thermal) {
  const ref = useRef(null);
  useEffect(() => {
    const reset = () =>
      ref.current?.style.removeProperty("--invoice-print-scale");
    const fit = () => {
      const invoice = ref.current;
      if (!invoice || thermal) return;
      reset();
      const page = document.createElement("div");
      page.style.cssText =
        "position:absolute;visibility:hidden;width:190mm;height:276mm;pointer-events:none";
      document.body.append(page);
      const scale = Math.min(
        1,
        page.getBoundingClientRect().height / invoice.scrollHeight,
      );
      page.remove();
      invoice.style.setProperty("--invoice-print-scale", String(scale || 1));
    };
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
      reset();
    };
  }, [thermal]);
  return ref;
}
