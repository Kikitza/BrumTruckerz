// „Zahtevi za CV" (v2-3 kriška 3) — radnik vidi firme koje traže NJEGOV PUN CV i
// ODOBRAVA/ODBIJA. Pre odobrenja JASNO piše šta firma dobija (cela istorija, ne samo njena firma).
// Sav pristup bazi kroz api sloj. Boje iz tokena, stringovi kroz t().
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { notify, confirmAction } from "../../lib/confirm";
import { fmtDateTime } from "../../lib/format";
import { myCvRequests, respondCvRequest, type CvRequest } from "./api";

export function CvRequestsList() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-cv-requests"], queryFn: myCvRequests });

  const respond = useMutation({
    mutationFn: ({ req, approve }: { req: CvRequest; approve: boolean }) => respondCvRequest(req.request_id, approve),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-cv-requests"] });
      qc.invalidateQueries({ queryKey: ["my-cv-consents"] });
    },
    onError: () => notify({ title: t("common.error") }),
  });

  const onDeny = async (req: CvRequest) => {
    if (await confirmAction({ title: t("cv.requests.denyConfirm", { company: req.company_name }), destructive: true, confirmLabel: t("cv.requests.deny"), cancelLabel: t("common.cancel") })) {
      respond.mutate({ req, approve: false });
    }
  };

  const requests = q.data ?? [];
  if (!q.isLoading && requests.length === 0) return null; // nema zahteva → ne zauzima prostor
  const busy = respond.isPending;

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 12 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("cv.requests.title")}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("cv.requests.explain")}</Text>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        requests.map((req) => (
          <View key={req.request_id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{req.company_name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmtDateTime(req.created_at)}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => respond.mutate({ req, approve: true })} disabled={busy}
                style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{t("cv.requests.approve")}</Text>
              </Pressable>
              <Pressable onPress={() => onDeny(req)} disabled={busy}
                style={{ flex: 1, borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 12, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("cv.requests.deny")}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
