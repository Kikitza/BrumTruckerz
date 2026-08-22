// „Ko vidi moj CV" (v2-3 kriška 3) — radnik vidi firme sa aktivnim pristankom na pun CV
// i može da OPOZOVE bilo kad (pristup se momentalno gasi). Pristup bazi kroz api sloj.
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { notify, confirmAction } from "../../lib/confirm";
import { fmtDate } from "../../lib/format";
import { myCvConsents, revokeCvConsent, type CvConsent } from "./api";

export function CvConsentsSection() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-cv-consents"], queryFn: myCvConsents });

  const revoke = useMutation({
    mutationFn: (c: CvConsent) => revokeCvConsent(c.company_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-cv-consents"] }),
    onError: () => notify({ title: t("common.error") }),
  });

  const onRevoke = async (c: CvConsent) => {
    if (await confirmAction({ title: t("cv.consents.revokeConfirm", { company: c.company_name }), destructive: true, confirmLabel: t("cv.consents.revoke"), cancelLabel: t("common.cancel") })) {
      revoke.mutate(c);
    }
  };

  const consents = q.data ?? [];

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("cv.consents.title")}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("cv.consents.hint")}</Text>
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : consents.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("cv.consents.empty")}</Text>
      ) : (
        consents.map((c) => (
          <View key={c.company_id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>{c.company_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("cv.consents.since", { date: fmtDate(c.granted_at) })}</Text>
            </View>
            <Pressable onPress={() => onRevoke(c)} disabled={revoke.isPending}
              style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, opacity: revoke.isPending ? 0.5 : 1 }}>
              <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 13 }}>{t("cv.consents.revoke")}</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}
