"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; isDark: boolean; toggleTheme: () => void };

const STORAGE_KEY = "madiuntrip-home-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		const storedTheme = window.localStorage.getItem(STORAGE_KEY);
		const initialTheme: Theme = storedTheme === "dark" ? "dark" : "light";
		setTheme(initialTheme);
		document.documentElement.dataset.theme = initialTheme;

		const syncTheme = (event: StorageEvent) => {
			if (event.key !== STORAGE_KEY) return;
			const next: Theme = event.newValue === "dark" ? "dark" : "light";
			setTheme(next);
			document.documentElement.dataset.theme = next;
		};
		window.addEventListener("storage", syncTheme);
		return () => window.removeEventListener("storage", syncTheme);
	}, []);

	const value = useMemo<ThemeContextValue>(() => ({
		theme,
		isDark: theme === "dark",
		toggleTheme: () => setTheme((current) => {
				const next = current === "dark" ? "light" : "dark";
				window.localStorage.setItem(STORAGE_KEY, next);
				document.documentElement.dataset.theme = next;
				return next;
			}),
	}), [theme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used inside ThemeProvider");
	return context;
}
