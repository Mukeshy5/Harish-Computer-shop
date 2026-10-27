import { useEffect, useRef } from "react";

// CSS zoom changes pagination as well as appearance; transform alone does not.
export function useA4PrintFit(thermal, pageHeightMm = 276) {
  const ref = useRef(null);
  useEffect(() => {
    const reset = () =>
      ref.current?.style.removeProperty("--invoice-print-scale");
    const fit = () => {
      const invoice = ref.current;
      if (!invoice || thermal) return;
      reset();
      const page = document.createElement("div");
      page.style.cssText = `position:absolute;visibility:hidden;width:190mm;height:${pageHeightMm}mm;pointer-events:none`;
      document.body.append(page);
      const pageHeight = page.getBoundingClientRect().height;
      let scale = Math.min(
        1,
        pageHeight /
          Math.max(
            invoice.scrollHeight,
            invoice.getBoundingClientRect().height,
          ),
      );
      page.remove();
      invoice.style.setProperty("--invoice-print-scale", String(scale || 1));
      // Zoom rounds collapsed table rules to physical pixels. Re-measure the
      // visible frame so accumulated border rounding cannot add a second page.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const height = invoice.getBoundingClientRect().height;
        if (height <= pageHeight) break;
        scale *= (pageHeight - 1) / height;
        invoice.style.setProperty("--invoice-print-scale", String(scale || 1));
      }
    };
    // Mobile browsers can switch print media after beforeprint. Fit again once
    // the A4 styles apply, instead of retaining measurements of the phone UI.
    const printMedia = window.matchMedia("print");
    const mediaChanged = () => {
      if (printMedia.matches) fit();
      else reset();
    };
    if (printMedia.addEventListener)
      printMedia.addEventListener("change", mediaChanged);
    else printMedia.addListener?.(mediaChanged);
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
      if (printMedia.removeEventListener)
        printMedia.removeEventListener("change", mediaChanged);
      else printMedia.removeListener?.(mediaChanged);
      reset();
    };
  }, [thermal, pageHeightMm]);
  return ref;
}
