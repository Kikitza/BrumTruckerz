// Dizajn tokeni (pravilo #8): boje SAMO odavde, nikad heks u komponenti.
// Dark/light: prati sistem + ručni override (zustand).
import { useColorScheme } from "react-native";
import { create } from "zustand";

export const palettes = {
  light: {
    bg: "#F6F7F9", surface: "#FFFFFF", text: "#16233B", textMuted: "#5A6B82",
    border: "#E4E8EF", primary: "#0E7C6B", danger: "#B4291F", warn: "#B4741A",
  },
  dark: {
    bg: "#0F1520", surface: "#1A2230", text: "#EDF1F7", textMuted: "#9AA7BA",
    border: "#2A3548", primary: "#3BB79F", danger: "#E06055", warn: "#D9A03F",
  },
} as const;
export type Palette = typeof palettes.light;

type Mode = "system" | "light" | "dark";
export const useThemeStore = create<{ mode: Mode; setMode: (m: Mode) => void }>((set) => ({
  mode: "system",
  setMode: (mode) => set({ mode }),
}));

export function useTheme(): { colors: Palette; scheme: "light" | "dark" } {
  const system = useColorScheme() ?? "light";
  const mode = useThemeStore((s) => s.mode);
  const scheme = mode === "system" ? system : mode;
  return { colors: palettes[scheme], scheme };
}
