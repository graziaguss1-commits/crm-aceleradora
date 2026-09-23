import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const ACCENT_PADRAO = "mogno";

type Theme = "light" | "dark" | "system";
type Density = "compact" | "normal" | "comfortable";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  density: Density;
  setDensity: (d: Density) => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  density: "normal",
  setDensity: () => {},
  accentColor: ACCENT_PADRAO,
  setAccentColor: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/**
 * Cores da identidade visual da clinica.
 * No tema escuro o mogno e o marinho ficam quase invisiveis contra o fundo
 * quase-preto, entao cada uma tem uma versao clareada.
 */
export const ACCENT_COLORS: Record<string, { light: string; dark: string; ring: string }> = {
  // Marrom mogno #5C3D2E - cor principal da marca
  mogno: { light: "20 33% 27%", dark: "20 30% 45%", ring: "29 57% 46%" },
  // Cobre queimado #B87333 - destaque premium
  cobre: { light: "29 57% 46%", dark: "29 57% 52%", ring: "29 57% 46%" },
  // Azul marinho #1B2C4E - contexto clinico
  marinho: { light: "220 49% 21%", dark: "220 45% 45%", ring: "220 49% 30%" },
  // Marrom escuro #3A2218 - ancora do gradiente
  cacau: { light: "18 41% 16%", dark: "18 30% 38%", ring: "29 57% 46%" },
};

export const ACCENT_LABELS: { value: string; label: string; color: string }[] = [
  { value: "mogno", label: "Mogno", color: "#5C3D2E" },
  { value: "cobre", label: "Cobre", color: "#B87333" },
  { value: "marinho", label: "Marinho", color: "#1B2C4E" },
  { value: "cacau", label: "Cacau", color: "#3A2218" },
];


export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem("fc-theme") as Theme) || "light");
  const [density, setDensityState] = useState<Density>(() => (localStorage.getItem("fc-density") as Density) || "normal");
  const [accentColor, setAccentState] = useState(() => {
    // Quem usou o sistema antes da mudanca tem uma cor antiga salva no
    // navegador; sem isto, ela sobrescreveria a identidade a cada carregamento.
    const salvo = localStorage.getItem("fc-accent");
    return salvo && salvo in ACCENT_COLORS ? salvo : ACCENT_PADRAO;
  });

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (t === "system") {
      const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(sys);
    } else {
      root.classList.add(t);
    }
  };

  const applyAccent = (color: string) => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");
    const palette = ACCENT_COLORS[color] || ACCENT_COLORS[ACCENT_PADRAO];
    const val = isDark ? palette.dark : palette.light;
    root.style.setProperty("--primary", val);
    root.style.setProperty("--ring", palette.ring);
    root.style.setProperty("--sidebar-primary", val);
    root.style.setProperty("--sidebar-ring", palette.ring);
  };

  useEffect(() => {
    applyTheme(theme);
    applyAccent(accentColor);
  }, [theme, accentColor]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (theme === "system") { applyTheme("system"); applyAccent(accentColor); } };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, accentColor]);

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem("fc-theme", t); };
  const setDensity = (d: Density) => { setDensityState(d); localStorage.setItem("fc-density", d); };
  const setAccentColor = (c: string) => { setAccentState(c); localStorage.setItem("fc-accent", c); };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, density, setDensity, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}
