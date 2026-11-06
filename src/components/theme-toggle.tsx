"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

import { COLOR_THEME_KEY as key } from "@/lib/color-theme";
const changeEvent = "resumeiq-theme-change";
let temporaryPreference: "light" | "dark" | null = null;

function preference(): "light" | "dark" | null {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : temporaryPreference;
  } catch { return temporaryPreference; }
}
function snapshot(): boolean { return document.documentElement.classList.contains("dark"); }
function serverSnapshot(): boolean { return false; }
function subscribe(notify: () => void): () => void {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    document.documentElement.classList.toggle("dark", (preference() ?? (media.matches ? "dark" : "light")) === "dark");
    notify();
  };
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    temporaryPreference = null;
    sync();
  };
  media.addEventListener("change", sync);
  window.addEventListener("storage", storage);
  window.addEventListener(changeEvent, notify);
  // Another tab can change storage after the head script but before hydration.
  // Reconcile on subscription so that an early storage event is not lost.
  sync();
  return () => {
    media.removeEventListener("change", sync);
    window.removeEventListener("storage", storage);
    window.removeEventListener(changeEvent, notify);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <Button variant="outline" size="icon" aria-label="Toggle dark theme" aria-pressed={dark}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = snapshot() ? "light" : "dark";
        temporaryPreference = next;
        // Only the color preference is stored, never resume or review data.
        try { localStorage.setItem(key, next); } catch { /* Theme still works for this page. */ }
        document.documentElement.classList.toggle("dark", next === "dark");
        window.dispatchEvent(new Event(changeEvent));
      }}>
      <Sun aria-hidden="true" className="hidden size-4 dark:block" />
      <Moon aria-hidden="true" className="size-4 dark:hidden" />
    </Button>
  );
}
