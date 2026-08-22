// Prekidač „Aktivna firma" (v2-3, ADR 0013). Prikazuje se SAMO korisniku sa VIŠE
// aktivnih članstava — korisnik sa jednim članstvom ne vidi ništa novo (nulta smetnja).
// Prebacivanje: set_active_company → očisti keš + preračunaj gate → reload na koren.
import { View, Text, Pressable } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { reloadAppUser } from "../auth/useSession";
import { listMyMemberships, setActiveCompany, type Membership } from "./activeCompany";

export function ActiveCompanySwitcher() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ["my-memberships"], queryFn: listMyMemberships });

  const memberships = q.data ?? [];
  // Nulta smetnja: prekidač postoji samo za multi-firmu.
  if (q.isLoading || memberships.length <= 1) return null;

  const onSwitch = async (m: Membership) => {
    if (m.is_active) return;
    await setActiveCompany(m.company_id);
    qc.clear();          // podaci prethodne firme se odbacuju (refetch za novu)
    reloadAppUser();     // gate preračunava ulogu/firmu
    router.replace("/"); // ponovo prođi kroz gate sa novom aktivnom firmom
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden" }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", padding: 16, paddingBottom: 8 }}>
        {t("settings.activeCompany.title")}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        {t("settings.activeCompany.hint")}
      </Text>
      {memberships.map((m) => (
        <Pressable
          key={m.company_id}
          onPress={() => onSwitch(m)}
          disabled={m.is_active}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>{m.company_name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t(`settings.activeCompany.role.${m.role}`)}</Text>
          </View>
          {m.is_active ? (
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>{t("settings.activeCompany.current")}</Text>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
