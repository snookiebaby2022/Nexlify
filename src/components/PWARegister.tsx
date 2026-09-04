"use client";

import { useEffect } from "react";
import { reloadOnceForStaleChunks } from "@/lib/chunk-load-recovery";

export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    const onControllerChange = () => {
      try {
        if (sessionStorage.getItem("nx-sw-reload")) return;
        sessionStorage.setItem("nx-sw-reload", "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const onReject = (event: PromiseRejectionEvent) => {
      if (reloadOnceForStaleChunks(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onReject);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);

  return null;
}
