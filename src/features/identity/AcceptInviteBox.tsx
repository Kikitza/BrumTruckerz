// „Imam kod firme" — primalac unosi kod i ulazi u firmu (prihvatanje pozivnice).
// Živi na NoRole ekranu (nalog nije povezan sa firmom). Sav pristup bazi kroz api sloj.
// Boje SAMO iz tokena (pravilo #8), stringovi SAMO kroz t() (pravilo #7).
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Field } from "../../components/form";
import { notify } from "../../lib/confirm";
import { useTheme } from "../../lib/theme";
import { acceptInvitation } from "./api";
import { isValidInviteCode, normalizeInviteCode, inviteErrorKey } from "./inviteCode";

// onJoined: pozivalac osvežava gate (reloadRole) — vidi funkciju u app/index.tsx.
export function AcceptInviteBox({ onJoined }: { onJoined: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  const accept = useMutation({
    mutationFn: () => acceptInvitation(normalizeInviteCode(code)),
    onSuccess: async (res) => {
      const msg = res.role === "dispatcher" ? t("invite.acceptedDispatcher") : t("invite.accepted");
      // Osveži status firme (suspend-gate) i preračunaj ulogu kroz gate.
      qc.invalidateQueries({ queryKey: ["my-company-status"] });
      // notify je web-safe: na native-u čeka „Gotovo", na webu window.alert — pa TEK onda onJoined
      // (na webu je RN Alert no-op → ranije onJoined nije okidao i član nije ušao u firmu).
      await notify({ title: msg, okLabel: t("common.done") });
      onJoined();
    },
    onError: (e) => notify({ title: t(inviteErrorKey(String((e as Error).message ?? e))) }),
  });

  const valid = isValidInviteCode(code);

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 }}
      >
        <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("invite.haveCode")}</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ width: "100%", gap: 12 }}>
      <Field
        label={t("invite.enterCode")}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        placeholder={t("invite.codePlaceholder")}
        colors={colors}
      />
      <Pressable
        onPress={() => accept.mutate()}
        disabled={!valid || accept.isPending}
        style={{
          backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center",
          opacity: !valid || accept.isPending ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
          {accept.isPending ? t("invite.joining") : t("invite.join")}
        </Text>
      </Pressable>
    </View>
  );
}
