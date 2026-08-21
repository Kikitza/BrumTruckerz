// Pozivnice (vlasnik): lista + „Nova pozivnica" (uloga + ime opciono) -> kod krupno +
// Kopiraj; otkazivanje uz potvrdu (REVERZIBILNOST). Sav pristup bazi kroz api sloj.
// Boje SAMO iz tokena (pravilo #8), stringovi SAMO kroz t() (pravilo #7).
import { useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import * as Clipboard from "expo-clipboard";
import { confirmAction, notify } from "../../lib/confirm";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { fmtDate } from "../../lib/format";
import { Field, PickerField, ModalScaffold } from "../../components/form";
import { listInvites, createInvite, cancelInvite, type Invitation, type InviteRole } from "./api";
import { effectiveInviteStatus, type InviteStatus } from "./inviteCode";

const ROLES: InviteRole[] = ["driver", "dispatcher"];

const STATUS_COLOR = (s: InviteStatus, c: Palette): string =>
  s === "pending" ? c.primary : s === "accepted" ? c.text : c.textMuted;

// allowDispatcher: da li pozivalac (vlasnik) sme da pravi i dispečerske pozivnice.
// Dispečer prosleđuje allowDispatcher=false → pravi/vidi SAMO vozačke (RLS to i tvrdi).
export function InvitesSection({ allowDispatcher = true }: { allowDispatcher?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const list = useQuery({ queryKey: ["invites"], queryFn: listInvites });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
    onError: (e) => notify({ title: t("common.error"), message: String((e as Error).message ?? e) }),
  });

  const confirmCancel = async (inv: Invitation) => {
    const ok = await confirmAction({
      title: t("invite.cancelConfirm"), confirmLabel: t("invite.cancel"), cancelLabel: t("common.cancel"),
    });
    if (ok) cancel.mutate(inv.id);
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 12 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>
        {t("invite.title")}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("invite.subtitle")}</Text>

      <Pressable
        onPress={() => setShowNew(true)}
        style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("invite.new")}</Text>
      </Pressable>

      {list.isLoading ? null : (list.data ?? []).length === 0 ? (
        <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 8 }}>{t("invite.empty")}</Text>
      ) : (
        <FlatList
          data={list.data}
          scrollEnabled={false}
          keyExtractor={(x) => x.id}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <InviteRow inv={item} colors={colors} onCancel={() => confirmCancel(item)} />
          )}
        />
      )}

      {showNew && <NewInviteModal allowDispatcher={allowDispatcher} onClose={() => setShowNew(false)} />}
    </View>
  );
}

// ── Red u listi pozivnica ──
function InviteRow({ inv, colors, onCancel }: { inv: Invitation; colors: Palette; onCancel: () => void }) {
  const { t } = useTranslation();
  const status = effectiveInviteStatus(inv.status, inv.expires_at, new Date());
  const isPending = status === "pending";
  const title = inv.invited_name?.trim() || t(`invite.role.${inv.role}`);

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.text, fontWeight: "600", flex: 1 }}>{title}</Text>
        <Text style={{ color: STATUS_COLOR(status, colors), fontSize: 12, fontWeight: "700" }}>
          {t(`invite.status.${status}`)}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t(`invite.role.${inv.role}`)}</Text>

      {isPending && (
        <>
          <CodeBox code={inv.code} colors={colors} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {t("invite.expiresOn", { date: fmtDate(inv.expires_at) })}
          </Text>
          <Pressable onPress={onCancel} hitSlop={6} style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
            <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("invite.cancel")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ── Kod krupno + Kopiraj (reusable u redu i u modalu) ──
function CodeBox({ code, colors }: { code: string; colors: Palette }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text selectable style={{ color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: 2, flex: 1 }}>
        {code}
      </Text>
      <Pressable
        onPress={copy}
        style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
      >
        <Text style={{ color: colors.primary, fontWeight: "600" }}>{copied ? t("invite.copied") : t("invite.copy")}</Text>
      </Pressable>
    </View>
  );
}

// ── Modal: nova pozivnica (uloga + ime) -> prikaz koda ──
function NewInviteModal({ allowDispatcher, onClose }: { allowDispatcher: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [role, setRole] = useState<InviteRole>("driver");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<Invitation | null>(null);

  const create = useMutation({
    mutationFn: () => createInvite({ role, invited_name: name.trim() || null }),
    onSuccess: (inv) => {
      setCreated(inv);
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e) => notify({ title: t("common.error"), message: String((e as Error).message ?? e) }),
  });

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View
        style={{
          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          padding: 16, borderBottomWidth: 1, borderColor: colors.border,
        }}
      >
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{created ? t("common.done") : t("common.cancel")}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("invite.new")}</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {created ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{t("invite.codeTitle")}</Text>
            <CodeBox code={created.code} colors={colors} />
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("invite.codeNote")}</Text>
            {created.role === "dispatcher" && (
              <Text style={{ color: colors.warn, fontSize: 12 }}>{t("invite.dispatcherNote")}</Text>
            )}
          </View>
        ) : (
          <>
            {allowDispatcher && (
              <PickerField
                label={t("invite.roleLabel")}
                value={role}
                options={ROLES.map((r) => ({ value: r, label: t(`invite.role.${r}`) }))}
                placeholder={t("invite.roleLabel")}
                onSelect={(v) => setRole((v as InviteRole) ?? "driver")}
                colors={colors}
              />
            )}
            <Field
              label={t("invite.nameLabel")}
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
              placeholder={t("invite.namePlaceholder")}
              colors={colors}
            />
            <Pressable
              onPress={() => create.mutate()}
              disabled={create.isPending}
              style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: create.isPending ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                {create.isPending ? t("common.saving") : t("invite.create")}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </ModalScaffold>
  );
}
