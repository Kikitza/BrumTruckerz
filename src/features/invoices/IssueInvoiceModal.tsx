// Izdavanje fakture iz TURE (uslov: tura ima naručioca i vozarinu). Predlog: iznos=vozarina,
// valuta firme, PDV/napomena iz podataka izdavaoca, rok = izdavanje + rok naručioca (izmenjivo).
// Pre prve fakture: „Podaci izdavaoca" jednom. Jezik PDF-a: sr/en. Sav pristup kroz invoices/api.
import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { notify } from "../../lib/confirm";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { Field, DateField, ModalScaffold } from "../../components/form";
import { toNum } from "../../lib/num";
import { fmtMoney } from "../../lib/format";
import { getIssueContext, issueInvoice } from "./api";
import { computeInvoiceAmounts, proposeDueDate } from "./calc";
import { generateInvoicePdf, type InvoiceLang } from "./pdf";
import { InvoiceSettingsModal } from "./InvoiceSettingsModal";
import { isWeb } from "../../lib/platform";

const todayYMD = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function IssueInvoiceModal({ tripId, onClose, onIssued }: { tripId: string; onClose: () => void; onIssued?: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const ctxQ = useQuery({ queryKey: ["issue-context", tripId], queryFn: () => getIssueContext(tripId) });

  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("0");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [vatNote, setVatNote] = useState("");
  const [note, setNote] = useState("");
  const [lang, setLang] = useState<InvoiceLang>("sr");
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    const ctx = ctxQ.data;
    if (!ctx) return;
    setAmount(ctx.trip.revenue != null ? String(ctx.trip.revenue) : "");
    setVatRate(String(ctx.settings?.default_vat_rate ?? 0));
    setVatNote(ctx.settings?.default_vat_note ?? "");
    setDueDate(proposeDueDate(todayYMD(), ctx.customer?.payment_terms_days ?? 30));
  }, [ctxQ.data]);

  const ctx = ctxQ.data;
  const hasIssuer = !!ctx?.settings?.legal_name;
  const amt = toNum(amount) ?? 0;
  const rate = toNum(vatRate) ?? 0;
  const preview = computeInvoiceAmounts(amt, rate);
  const cur = ctx?.base_currency ?? "EUR";

  const issue = useMutation({
    mutationFn: async () => {
      const inv = await issueInvoice({
        customer_id: ctx!.trip.customer_id!,
        trip_id: ctx!.trip.id,
        currency: cur,
        amount: amt,
        vat_rate: rate,
        due_date: dueDate,
        vat_note: vatNote,
        note,
      });
      // PDF best-effort (ne ruši izdavanje). Native-only (F3) — na webu se preskače (generiše se iz detalja na mobilnom).
      if (!isWeb) { try { await generateInvoicePdf(inv.id, lang); } catch { /* PDF se može ponovo generisati */ } }
      return inv;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["issuable-trips"] });
      onIssued?.();
      onClose();
    },
    onError: (e) => notify({ title: t("common.error"), message: String((e as Error).message ?? e) }),
  });

  const valid = !!ctx?.trip.customer_id && amt > 0 && hasIssuer && !issue.isPending;

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("invoice.issueTitle")}</Text>
        <Pressable onPress={() => issue.mutate()} disabled={!valid} hitSlop={8}>
          <Text style={{ color: valid ? colors.primary : colors.textMuted, fontWeight: "700", fontSize: 16 }}>
            {issue.isPending ? t("common.saving") : t("invoice.issue")}
          </Text>
        </Pressable>
      </View>

      {ctxQ.isLoading || !ctx ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {!hasIssuer && (
            <Pressable onPress={() => setSetup(true)} style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.warn }}>
              <Text style={{ color: colors.warn, fontWeight: "600" }}>{t("invoice.setupIssuer")}</Text>
            </Pressable>
          )}

          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("invoice.fields.customer")}</Text>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{ctx.customer?.name ?? "—"}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {(ctx.trip.origin ?? "—")} → {(ctx.trip.destination ?? "—")}
            </Text>
          </View>

          <Field label={t("invoice.fields.amount", { currency: cur })} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" colors={colors} />
          <Field label={t("invoice.fields.vatRate")} value={vatRate} onChangeText={setVatRate} keyboardType="numeric" placeholder="0" colors={colors} />
          <DateField label={t("invoice.fields.dueDate")} value={dueDate} onChange={setDueDate} colors={colors} placeholder="—" />
          <Field label={t("invoice.fields.vatNote")} value={vatNote} onChangeText={setVatNote} autoCapitalize="sentences" colors={colors} />
          <Field label={t("invoice.fields.note")} value={note} onChangeText={setNote} autoCapitalize="sentences" colors={colors} />

          {/* Jezik PDF-a */}
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("invoice.fields.pdfLang")}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["sr", "en"] as InvoiceLang[]).map((l) => {
                const active = lang === l;
                return (
                  <Pressable key={l} onPress={() => setLang(l)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }}>
                    <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: "600" }}>{l.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <PreviewBox base={preview.amount} vat={preview.vatAmount} total={preview.total} rate={rate} cur={cur} colors={colors} />
        </ScrollView>
      )}

      {setup && <InvoiceSettingsModal onClose={() => setSetup(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["issue-context", tripId] })} />}
    </ModalScaffold>
  );
}

function PreviewBox({ base, vat, total, rate, cur, colors }: { base: number; vat: number; total: number; rate: number; cur: string; colors: Palette }) {
  const { t } = useTranslation();
  const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color: bold ? colors.text : colors.textMuted, fontWeight: bold ? "700" : "400" }}>{k}</Text>
      <Text style={{ color: colors.text, fontWeight: bold ? "700" : "400" }}>{v}</Text>
    </View>
  );
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, backgroundColor: colors.surface }}>
      <Row k={t("invoice.fields.base")} v={fmtMoney(base, cur)} />
      <Row k={`${t("invoice.fields.vat")} (${rate}%)`} v={fmtMoney(vat, cur)} />
      <Row k={t("invoice.fields.total")} v={fmtMoney(total, cur)} bold />
    </View>
  );
}
