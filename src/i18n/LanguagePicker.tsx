// Reusable izbor jezika (pravilo KVALITET: jedna komponenta za login i header).
// Trigger -> modalni padajući meni svih jezika (zastava + naziv na tom jeziku).
// Mašinski prevodi nose diskretnu „beta" oznaku. Izbor menja jezik u hodu i pamti se.
import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../lib/theme";
import { LANGUAGES, getLanguage, type Language } from "./languages";
import { useLanguage } from "./useLanguage";

// Zastava sa zaobljenim uglovima (isti izgled na svim mestima).
function Flag({ lang, w }: { lang: Language; w: number }) {
  const h = Math.round((w * 3) / 4); // flag-icons je 4:3
  return (
    <View style={{ width: w, height: h, borderRadius: 3, overflow: "hidden" }}>
      <lang.Flag width={w} height={h} />
    </View>
  );
}

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { current, change } = useLanguage();
  const [open, setOpen] = useState(false);

  const active = getLanguage(current) ?? LANGUAGES[0];

  const select = async (code: string) => {
    setOpen(false);
    if (code !== current) await change(code);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("language.title")}
        style={
          compact
            ? { padding: 4 }
            : {
                flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center",
                borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface,
              }
        }
      >
        <Flag lang={active} w={compact ? 26 : 24} />
        {!compact && (
          <>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{active.name}</Text>
            <Text style={{ color: colors.textMuted }}>▾</Text>
          </>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 24 }} onPress={() => setOpen(false)}>
          {/* stopni klik unutar kartice da ne zatvara meni */}
          <Pressable
            onPress={() => {}}
            style={{ maxHeight: "80%", borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", padding: 16, paddingBottom: 8 }}>
              {t("language.title")}
            </Text>
            <ScrollView>
              {LANGUAGES.map((l) => (
                <LanguageRow key={l.code} lang={l} selected={l.code === current} colors={colors} betaLabel={t("language.beta")} onPress={() => select(l.code)} />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function LanguageRow({
  lang, selected, colors, betaLabel, onPress,
}: { lang: Language; selected: boolean; colors: Palette; betaLabel: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 12, paddingHorizontal: 16,
        backgroundColor: selected ? colors.bg : colors.surface,
      }}
    >
      <Flag lang={lang} w={28} />
      <Text style={{ flex: 1, color: colors.text, fontWeight: selected ? "700" : "500" }}>{lang.name}</Text>
      {!lang.verified && (
        <View style={{ paddingVertical: 1, paddingHorizontal: 6, borderRadius: 5, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{betaLabel}</Text>
        </View>
      )}
      {selected && <Text style={{ color: colors.primary, fontWeight: "700" }}>✓</Text>}
    </Pressable>
  );
}
