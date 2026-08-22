// „Pozivi" radnika (v2-3 kriška 2, ADR 0014) — pozivi UPUĆENI njemu preko mreže.
// Prihvatanje = ISTA kapija (accept_invitation): v1 pravila iz 0034 važe (drugi aktivni
// vozač → jasna greška). Odbijanje → decline_network_invite. Sav pristup bazi kroz api sloj.
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { notify, confirmAction } from "../../lib/confirm";
import { fmtDateTime } from "../../lib/format";
import { acceptInvitation } from "../identity/api";
import { inviteErrorKey } from "../identity/inviteCode";
import { reloadAppUser } from "../auth/useSession";
import { listMyNetworkInvites, declineNetworkInvite, type NetworkInvite } from "./api";

export function NetworkInvites() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-network-invites"], queryFn: listMyNetworkInvites });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-network-invites"] });
    qc.invalidateQueries({ queryKey: ["my-memberships"] });
    qc.invalidateQueries({ queryKey: ["my-company-status"] });
  };

  const accept = useMutation({
    mutationFn: (inv: NetworkInvite) => acceptInvitation(inv.code),
    onSuccess: async (res) => {
      refresh();
      reloadAppUser(); // gate preračuna ulogu/firmu (novo aktivno članstvo)
      await notify({ title: res.role === "dispatcher" ? t("invite.acceptedDispatcher") : t("invite.accepted"), okLabel: t("common.done") });
    },
    onError: (e) => notify({ title: t(inviteErrorKey(String((e as Error).message ?? e))) }),
  });

  const decline = useMutation({
    mutationFn: (inv: NetworkInvite) => declineNetworkInvite(inv.invite_id),
    onSuccess: () => refresh(),
    onError: (e) => notify({ title: t(inviteErrorKey(String((e as Error).message ?? e))) }),
  });

  const onDecline = async (inv: NetworkInvite) => {
    if (await confirmAction({ title: t("network.invites.declineConfirm", { company: inv.company_name }), destructive: true, confirmLabel: t("network.invites.decline"), cancelLabel: t("common.cancel") })) {
      decline.mutate(inv);
    }
  };

  const invites = q.data ?? [];
  const busy = accept.isPending || decline.isPending;

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 12 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("network.invites.title")}</Text>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : invites.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("network.invites.empty")}</Text>
      ) : (
        invites.map((inv) => (
          <View key={inv.invite_id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{inv.company_name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {t("network.invites.role", { role: t(`network.role.${inv.role}`) })} · {fmtDateTime(inv.created_at)}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => accept.mutate(inv)} disabled={busy}
                style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{t("network.invites.accept")}</Text>
              </Pressable>
              <Pressable onPress={() => onDecline(inv)} disabled={busy}
                style={{ flex: 1, borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 12, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("network.invites.decline")}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
