"use client";

import { useEffect } from "react";

/**
 * On phones, tables read better as cards. This labels every body cell with
 * its column heading so CSS (below the sm breakpoint only) can stack each row
 * into a card. Desktop layout is unaffected; the labels are just attributes.
 */
export function MobileTables() {
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    let frame = 0;
    const label = () => {
      frame = 0;
      if (!mq.matches) return;
      for (const table of document.querySelectorAll<HTMLTableElement>("main table:not([data-no-stack])")) {
        const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
        if (!heads.length) continue;
        table.classList.add("m-stack");
        for (const row of table.querySelectorAll("tbody tr")) {
          [...row.children].forEach((cell, i) => {
            const text = heads[i] ?? "";
            if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
          });
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(label);
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    mq.addEventListener("change", schedule);
    return () => {
      obs.disconnect();
      mq.removeEventListener("change", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
