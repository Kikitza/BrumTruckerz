// Fakture (office: owner + dispečer): lista sa bedžom statusa (izdata/plaćena/KASNI crveno/stornirana),
// filteri, „Nova faktura" (izbor ture bez fakture), detalj sa akcijama. Vozač fakture NE vidi (nema tab).
import { useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../src/lib/theme";
import { useWideWeb } from "../../src/lib/platform";
import { fmtMoney, fmtDate } from "../../src/lib/format";
import { DesktopContainer } from "../../src/components/DesktopContainer";
import { DataTable, type Column } from "../../src/components/DataTable";
import { LoadMore } from "../../src/components/LoadMore";
import { ModalScaffold } from "../../src/components/form";
import { listInvoices, listIssuableTrips, type InvoiceRow, type IssuableTrip } from "../../src/features/invoices/api";
import { invoiceDisplayStatus, type InvoiceDisplayStatus } from "../../src/features/invoices/calc";
import { InvoiceDetailModal } from "../../src/features/invoices/InvoiceDetailModal";
import { IssueInvoiceModal } from "../../src/features/invoices/IssueInvoiceModal";
import { InvoiceSettingsModal } from "../../src/features/invoices/InvoiceSettingsModal";

type Filter = "all" | "issued" | "overdue" | "paid" | "cancelled";
const FILTERS: Filter[] = ["all", "issued", "overdue", "paid", "cancelled"];

const todayYMD = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const STATUS_COLOR = (s: InvoiceDisplayStatus, c: Palette): string =>
  s === "paid" ? c.primary : s === "overdue" ? c.danger : s === "cancelled" ? c.textMuted : c.text;

export default function InvoicesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [issuingTripId, setIssuingTripId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [settings, setSettings] = useState(false);

  const wide = useWideWeb();
  const [shown, setShown] = useState(50);
  const list = useQuery({ queryKey: ["invoices", shown], queryFn: () => listInvoices(shown) });
  const hasMore = (list.data?.length ?? 0) >= shown;
  const loadMore = () => setShown((s) => s + 50);
  const today = todayYMD();
  const rows = (list.data ?? []).filter((inv) => {
    if (filter === "all") return true;
    return invoiceDisplayStatus(inv.status, inv.due_date, today) === filter;
  });

  const cols: Column<InvoiceRow>[] = [
    { key: "no", header: t("invoice.table.no"), width: 1, render: (r) => r.invoice_no, sort: (r) => r.invoice_no },
    { key: "customer", header: t("invoice.fields.customer"), width: 1.6, render: (r) => r.customer?.name ?? "—", sort: (r) => r.customer?.name ?? "" },
    { key: "issued", header: t("invoice.fields.issueDate"), width: 1, render: (r) => fmtDate(r.issue_date), sort: (r) => r.issue_date },
    { key: "due", header: t("invoice.fields.dueDate"), width: 1, render: (r) => (r.due_date ? fmtDate(r.due_date) : "—") },
    { key: "amount", header: t("invoice.fields.total"), width: 1, align: "right", render: (r) => fmtMoney(r.total, r.currency) },
    { key: "status", header: t("invoice.table.status"), width: 1, render: (r) => {
        const d = invoiceDisplayStatus(r.status, r.due_date, today);
        return <Text style={{ color: STATUS_COLOR(d, colors), fontWeight: "700", fontSize: 12 }}>{t(`invoice.status.${d}`)}</Text>;
      } },
  ];

  return (
    // WEB (F3): spoljni sloj puni širinu temom (bez belih ivica), unutra centriran max-width kontejner.
    <DesktopContainer maxWidth={1240}>
      <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
        <Pressable onPress={() => setPicking(true)}
          style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}>
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("invoice.new")}</Text>
        </Pressable>
        <Pressable onPress={() => setSettings(true)}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{t("invoice.settings.short")}</Text>
        </Pressable>
      </View>

      {/* Filteri */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable key={f} onPress={() => setFilter(f)}
              style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1,
                borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }}>
              <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: 13 }}>{t(`invoice.filter.${f}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {list.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : wide ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
          <DataTable columns={cols} rows={rows} keyExtractor={(r) => r.id} onRowPress={(r) => setDetailId(r.id)} />
          {hasMore ? <LoadMore colors={colors} label={t("common.loadMore")} onPress={loadMore} /> : null}
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          ListFooterComponent={hasMore ? <LoadMore colors={colors} label={t("common.loadMore")} onPress={loadMore} /> : null}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.textMuted, marginTop: 24 }}>{t("invoice.empty")}</Text>}
          renderItem={({ item }) => <Row inv={item} today={today} colors={colors} t={t} onPress={() => setDetailId(item.id)} />}
        />
      )}

      {detailId && <InvoiceDetailModal invoiceId={detailId} onClose={() => setDetailId(null)} />}
      {issuingTripId && <IssueInvoiceModal tripId={issuingTripId} onClose={() => setIssuingTripId(null)} />}
      {settings && <InvoiceSettingsModal onClose={() => setSettings(false)} />}
      {picking && (
        <TripPicker
          onClose={() => setPicking(false)}
          onPick={(id) => { setPicking(false); setIssuingTripId(id); }}
        />
      )}
    </DesktopContainer>
  );
}

function Row({ inv, today, colors, t, onPress }: { inv: InvoiceRow; today: string; colors: Palette; t: (k: string) => string; onPress: () => void }) {
  const disp = invoiceDisplayStatus(inv.status, inv.due_date, today);
  return (
    <Pressable onPress={onPress} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.text, fontWeight: "700" }}>{inv.invoice_no}</Text>
        <Text style={{ color: STATUS_COLOR(disp, colors), fontWeight: "700", fontSize: 12 }}>{t(`invoice.status.${disp}`)}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textMuted, flex: 1 }} numberOfLines={1}>{inv.customer?.name ?? "—"}</Text>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{fmtMoney(inv.total, inv.currency)}</Text>
      </View>
    </Pressable>
  );
}

// Izbor ture bez fakture (za „Nova faktura" iz taba).
function TripPicker({ onClose, onPick }: { onClose: () => void; onPick: (tripId: string) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["issuable-trips"], queryFn: listIssuableTrips });
  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("invoice.pickTrip")}</Text>
        <View style={{ width: 48 }} />
      </View>
      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.textMuted, marginTop: 24 }}>{t("invoice.noIssuableTrips")}</Text>}
          renderItem={({ item }: { item: IssuableTrip }) => (
            <Pressable onPress={() => onPick(item.id)} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{item.customer?.name ?? "—"}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                {(item.origin ?? "—")} → {(item.destination ?? "—")}
              </Text>
            </Pressable>
          )}
        />
      )}
    </ModalScaffold>
  );
}
