// Onboarding DOM radnika BEZ firme (v2-3 kriška 2b, ADR 0013 dopuna). Identitet sa nula
// aktivnih članstava: gradi svoj MREŽNI PROFIL i prima POZIVE pre nego što uđe u ijednu firmu;
// uz to i dalje može „Imam kod firme" i „Otvori novu firmu". Radi na MOBILNOM i WEBU
// (web = kapija akvizicije). Reuse komponenti iz kriške 2; boje iz tokena, stringovi kroz t().
import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { DesktopContainer } from "../../components/DesktopContainer";
import { useSignOut } from "../auth/signOut";
import { AcceptInviteBox } from "../identity/AcceptInviteBox";
import { NewCompanyWizard } from "../company/NewCompanyWizard";
import { NetworkInvites } from "../network/NetworkInvites";
import { NetworkProfileEditor } from "../network/NetworkProfileEditor";
import { CvRequestsList } from "../cv/CvRequestsList";
import { CvConsentsSection } from "../cv/CvConsentsSection";

// onJoined: po prihvatanju koda / otvaranju firme → osveži gate (reloadRole u app/index).
export function WorkerOnboardingHome({ onJoined }: { onJoined: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const signOut = useSignOut();
  const [wizard, setWizard] = useState(false);

  return (
    <Screen top={false}>
      <DesktopContainer maxWidth={720}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{t("onboarding.title")}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t("onboarding.subtitle")}</Text>
          </View>

          {/* Pozivi mogu stići i PRE ulaska u firmu (firma poziva po javnom broju). */}
          <NetworkInvites />

          {/* Zahtevi firmi za pun CV (radnik odobrava/odbija). */}
          <CvRequestsList />

          {/* Mrežni profil — gradi vidljivost tržištu; pri deklarisanju role dobija javni broj. */}
          <NetworkProfileEditor />

          {/* Ko vidi moj CV — lista firmi sa pristankom + opoziv. */}
          <CvConsentsSection />

          {/* Alternativni ulazi: kod firme ili otvaranje sopstvene firme. */}
          <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("onboarding.orJoin")}</Text>
            <AcceptInviteBox onJoined={onJoined} />
            <Pressable onPress={() => setWizard(true)}
              style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("company.openNew")}</Text>
            </Pressable>
          </View>

          <Pressable onPress={signOut}
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, alignItems: "center" }}>
            <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("settings.signOut")}</Text>
          </Pressable>

          {wizard && <NewCompanyWizard onClose={() => setWizard(false)} onCreated={onJoined} />}
        </ScrollView>
      </DesktopContainer>
    </Screen>
  );
}
