import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "litlens-theme";
const media = () => window.matchMedia("(prefers-color-scheme: light)");

function stored(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

/** Follows the OS until the user picks a theme; the pick is remembered. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? (media().matches ? "light" : "dark"));

  useEffect(() => {
    const pick = stored();
    if (pick) document.documentElement.dataset.theme = pick;
    const onChange = () => {
      if (!stored()) setTheme(media().matches ? "light" : "dark");
    };
    media().addEventListener("change", onChange);
    return () => media().removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: theme just won't persist */
    }
    setTheme(next);
  };

  return { theme, toggle };
}
