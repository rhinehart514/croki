"use client";

import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "acme-theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    let storedTheme: string | null = null;

    try {
      storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // A blocked storage API should not make appearance settings unusable.
    }

    const theme = storedTheme === "dark" ? "dark" : "light";
    applyTheme(theme);
    setDarkMode(theme === "dark");
  }, []);

  function changeTheme(enabled: boolean) {
    const theme = enabled ? "dark" : "light";

    setDarkMode(enabled);
    applyTheme(theme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selection still applies for this page view when storage is unavailable.
    }
  }

  return (
    <label className="theme-setting">
      <span className="theme-setting-copy">
        <span className="theme-setting-title">Dark mode</span>
        <span className="theme-setting-description">Use a darker appearance across Acme.</span>
      </span>
      <span className="theme-switch">
        <input
          className="theme-switch-input"
          type="checkbox"
          role="switch"
          checked={darkMode}
          onChange={(event) => changeTheme(event.target.checked)}
        />
        <span className="theme-switch-track" aria-hidden="true" />
      </span>
    </label>
  );
}
