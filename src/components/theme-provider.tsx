"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; isDark: boolean; toggleTheme: () => void };

const STORAGE_KEY = "tiloc-home-theme";
const LEGACY_STORAGE_KEY = "madiuntrip-home-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);
const applyThemeChrome = (next: Theme) => {
	const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (meta) meta.content = next === "dark" ? "#06172a" : "#eaf6fc";
};

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>("light");
	const applyTheme = useCallback((next: Theme) => {
		setTheme(next);
		const root = document.documentElement;
		root.dataset.theme = next;
		root.classList.toggle("dark", next === "dark");
		root.classList.toggle("light", next === "light");
		applyThemeChrome(next);
		window.localStorage.setItem(STORAGE_KEY, next);
	}, []);

	useEffect(() => {
		const storedTheme = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
		const initialTheme: Theme = storedTheme === "dark" ? "dark" : "light";
		if (storedTheme) window.localStorage.setItem(STORAGE_KEY, storedTheme);
		const setInitialTheme = (next: Theme) => {
			setTheme(next);
			const root = document.documentElement;
			root.dataset.theme = next;
			root.classList.toggle("dark", next === "dark");
			root.classList.toggle("light", next === "light");
			applyThemeChrome(next);
		};
		setInitialTheme(initialTheme);

		const syncTheme = (event: StorageEvent) => {
			if (event.key !== STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY) return;
			const next: Theme = event.newValue === "dark" ? "dark" : "light";
			setInitialTheme(next);
		};
		window.addEventListener("storage", syncTheme);
		return () => window.removeEventListener("storage", syncTheme);
	}, []);

	const value = useMemo<ThemeContextValue>(() => ({
		theme,
		isDark: theme === "dark",
		toggleTheme: () => applyTheme(theme === "dark" ? "light" : "dark"),
	}), [theme, applyTheme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used inside ThemeProvider");
	return context;
}
