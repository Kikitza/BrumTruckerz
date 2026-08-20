// Detalj fakture (office): podaci + akcije „Podeli PDF", „Označi plaćeno" (potvrda + datum),
// „Storniraj" (potvrda + razlog). Vozač fakture NE vidi (nema tab ni RLS). Pristup kroz invoices/api.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { Field, DateField, ModalScaffold } from "../../components/form";
import { fmtMoney, fmtDate } from "../../lib/format";
import { getInvoice, markInvoicePaid, cancelInvoice } from "./api";
import { shareInvoicePdf, type InvoiceLang } from "./pdf";
import { invoiceDisplayStatus, type InvoiceDisplayStatus } from "./calc";

const todayYMD = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const STATUS_COLOR = (s: InvoiceDisplayStatus, c: Palette): string =>
  s === "paid" ? c.primary : s === "overdue" ? c.danger : s === "cancelled" ? c.textMuted : c.text;

export function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice", invoiceId], queryFn: () => getInvoice(invoiceId) });
  const inv = q.data;

  const [mode, setMode] = useState<"view" | "paying" | "cancelling">("view");
  const [paidAt, setPaidAt] = useState<string | null>(todayYMD());
  const [reason, setReason] = useState("");
  const [lang, setLang] = useState<InvoiceLang>("sr");
  const [sharing, setSharing] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };
  const onErr = (e: unknown) => Alert.alert(t("common.error"), String((e as Error).message ?? e));

  const pay = useMutation({ mutationFn: () => markInvoicePaid(invoiceId, paidAt ?? todayYMD()), onSuccess: () => { invalidate(); setMode("view"); }, onError: onErr });
  const cancel = useMutation({ mutationFn: () => cancelInvoice(invoiceId, reason), onSuccess: () => { invalidate(); setMode("view"); }, onError: onErr });

  const share = async () => {
    setSharing(true);
    try { await shareInvoicePdf(invoiceId, lang); invalidate(); }
    catch (e) { onErr(e); }
    finally { setSharing(false); }
  };

  const disp = inv ? invoiceDisplayStatus(inv.status, inv.due_date, todayYMD()) : "issued";

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.done")}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{inv?.invoice_no ?? t("invoice.detailTitle")}</Text>
        <View style={{ width: 48 }} />
      </View>

      {q.isLoading || !inv ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: STATUS_COLOR(disp, colors) }}>
            <Text style={{ color: STATUS_COLOR(disp, colors), fontWeight: "700" }}>{t(`invoice.status.${disp}`)}</Text>
          </View>

          <KV k={t("invoice.fields.customer")} v={inv.customer?.name ?? "—"} colors={colors} />
          <KV k={t("invoice.fields.issueDate")} v={fmtDate(inv.issue_date)} colors={colors} />
          {inv.due_date ? <KV k={t("invoice.fields.dueDate")} v={fmtDate(inv.due_date)} colors={colors} /> : null}
          <KV k={t("invoice.fields.base")} v={fmtMoney(inv.amount, inv.currency)} colors={colors} />
          <KV k={`${t("invoice.fields.vat")} (${inv.vat_rate}%)`} v={fmtMoney(inv.vat_amount, inv.currency)} colors={colors} />
          <KV k={t("invoice.fields.total")} v={fmtMoney(inv.total, inv.currency)} colors={colors} bold />
          {inv.paid_at ? <KV k={t("invoice.status.paid")} v={fmtDate(inv.paid_at)} colors={colors} /> : null}
          {inv.cancel_reason ? <KV k={t("invoice.cancelReason")} v={inv.cancel_reason} colors={colors} /> : null}

          {/* Jezik PDF-a + Podeli */}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {(["sr", "en"] as InvoiceLang[]).map((l) => {
              const active = lang === l;
              return (
                <Pressable key={l} onPress={() => setLang(l)}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }}>
                  <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: "600" }}>{l.toUpperCase()}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={share} disabled={sharing}
              style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: sharing ? 0.6 : 1 }}>
              <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{sharing ? t("common.saving") : t("invoice.sharePdf")}</Text>
            </Pressable>
          </View>

          {/* Akcije statusa */}
          {inv.status === "issued" && mode === "view" && (
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => setMode("paying")} style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("invoice.markPaid")}</Text>
              </Pressable>
              <Pressable onPress={() => setMode("cancelling")} style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 12, alignItems: "center" }}>
                <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("invoice.cancel")}</Text>
              </Pressable>
            </View>
          )}

          {mode === "paying" && (
            <View style={{ gap: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
              <DateField label={t("invoice.paidAt")} value={paidAt} onChange={setPaidAt} colors={colors} clearable={false} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => setMode("view")} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center" }}>
                  <Text style={{ color: colors.text }}>{t("common.cancel")}</Text>
                </Pressable>
                <Pressable onPress={() => pay.mutate()} disabled={pay.isPending} style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: pay.isPending ? 0.6 : 1 }}>
                  <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("invoice.confirmPaid")}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === "cancelling" && (
            <View style={{ gap: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
              <Field label={t("invoice.cancelReason")} value={reason} onChangeText={setReason} autoCapitalize="sentences" colors={colors} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => setMode("view")} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center" }}>
                  <Text style={{ color: colors.text }}>{t("common.cancel")}</Text>
                </Pressable>
                <Pressable onPress={() => cancel.mutate()} disabled={cancel.isPending} style={{ flex: 1, backgroundColor: colors.danger, borderRadius: 8, padding: 12, alignItems: "center", opacity: cancel.isPending ? 0.6 : 1 }}>
                  <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("invoice.confirmCancel")}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </ModalScaffold>
  );
}

function KV({ k, v, colors, bold }: { k: string; v: string; colors: Palette; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.textMuted }}>{k}</Text>
      <Text style={{ color: colors.text, fontWeight: bold ? "700" : "400" }}>{v}</Text>
    </View>
  );
}
