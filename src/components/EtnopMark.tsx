// ETNOP znak (Evropa dot-map), tema-svestan: tamna varijanta u dark temi, svetla u light.
// Izvor: assets/brand/etnop-mark-europe(-light).svg (react-native-svg komponente).
import { useTheme } from "../lib/theme";
import MarkDark from "../../assets/brand/etnop-mark-europe.svg";
import MarkLight from "../../assets/brand/etnop-mark-europe-light.svg";

export function EtnopMark({ size = 96 }: { size?: number }) {
  const { scheme } = useTheme();
  const Mark = scheme === "dark" ? MarkDark : MarkLight;
  return <Mark width={size} height={size} />;
}
