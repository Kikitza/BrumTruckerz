// Naručioci (kancelarija: owner + dispečer): lista (naziv, PIB, rok plaćanja),
// filter aktivni/arhivirani, Nova/Izmeni (modal), brisanje: sa turama → samo Arhiviraj
// (+ Aktiviraj nazad), bez tura → brisanje. Sav pristup bazi kroz customers/api.ts.
import { useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, ScrollView } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../src/lib/theme";
import { useWideWeb } from "../../src/lib/platform";
import { confirmAction, notify } from "../../src/lib/confirm";
import { fmtDate } from "../../src/lib/format";
import { DesktopContainer } from "../../src/components/DesktopContainer";
import { DataTable, type Column } from "../../src/components/DataTable";
import { LoadMore } from "../../src/components/LoadMore";
import {
  listCustomers, archiveCustomer, unarchiveCustomer, deleteCustomer, type Customer,
} from "../../src/features/customers/api";
import { CustomerFormModal } from "../../src/features/customers/CustomerFormModal";

export default function CustomersScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; item: Customer | null }>({ open: false, item: null });

  const wide = useWideWeb();
  const [shown, setShown] = useState(50);
  const list = useQuery({ queryKey: ["customers", shown], queryFn: () => listCustomers(shown) });
  const hasMore = (list.data?.length ?? 0) >= shown;
  const loadMore = () => setShown((s) => s + 50);
  const rows = (list.data ?? []).filter((c) => (showArchived ? c.archived_at != null : c.archived_at == null));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["customers"] });
  const onErr = (e: unknown) => notify({ title: t("common.error"), message: String((e as Error).message ?? e) });

  const archive = useMutation({ mutationFn: (id: string) => archiveCustomer(id), onSuccess: invalidate, onError: onErr });
  const unarchive = useMutation({ mutationFn: (id: string) => unarchiveCustomer(id), onSuccess: invalidate, onError: onErr });
  const del = useMutation({ mutationFn: (id: string) => deleteCustomer(id), onSuccess: invalidate, onError: onErr });

  const confirmArchive = async (c: Customer) => {
    const ok = await confirmAction({
      title: t("customers.archiveConfirm"), confirmLabel: t("customers.archive"), cancelLabel: t("common.cancel"),
    });
    if (ok) archive.mutate(c.id);
  };
  const confirmDelete = async (c: Customer) => {
    const ok = await confirmAction({
      title: t("customers.deleteConfirm"), confirmLabel: t("common.delete"), cancelLabel: t("common.cancel"),
    });
    if (ok) del.mutate(c.id);
  };

  const cols: Column<Customer>[] = [
    { key: "name", header: t("customers.fields.name"), width: 2, render: (c) => c.name, sort: (c) => c.name },
    { key: "vat", header: t("customers.fields.vatNumber"), width: 1.4, render: (c) => (
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14 }}>
          {c.vat_number ?? "—"}{c.vies_valid ? <Text style={{ color: colors.primary }}> ✓</Text> : null}
        </Text>
      ) },
    { key: "terms", header: t("customers.fields.paymentTerms"), width: 1, align: "right", render: (c) => String(c.payment_terms_days) },
    { key: "trips", header: t("customers.table.trips"), width: 1, align: "right", render: (c) => String(c.trip_count) },
    { key: "status", header: t("customers.table.status"), width: 1, render: (c) => (
        <Text style={{ color: c.archived_at ? colors.textMuted : colors.primary, fontWeight: "600", fontSize: 12 }}>
          {t(c.archived_at ? "customers.archived" : "customers.active")}
        </Text>
      ) },
  ];

  return (
    <DesktopContainer maxWidth={1200}>
      {/* Filter aktivni/arhivirani */}
      <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
        {[false, true].map((arch) => {
          const activeSeg = showArchived === arch;
          return (
            <Pressable key={String(arch)} onPress={() => setShowArchived(arch)}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1,
                borderColor: activeSeg ? colors.primary : colors.border,
                backgroundColor: activeSeg ? colors.primary : colors.surface,
              }}>
              <Text style={{ color: activeSeg ? colors.onPrimary : colors.text, fontWeight: "600" }}>
                {t(arch ? "customers.archived" : "customers.active")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <Pressable onPress={() => setModal({ open: true, item: null })}
          style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}>
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("customers.new")}</Text>
        </Pressable>
      </View>

      {list.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : wide ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
          <DataTable columns={cols} rows={rows} keyExtractor={(c) => c.id} onRowPress={(c) => setModal({ open: true, item: c })} />
          {hasMore ? <LoadMore colors={colors} label={t("common.loadMore")} onPress={loadMore} /> : null}
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          ListFooterComponent={hasMore ? <LoadMore colors={colors} label={t("common.loadMore")} onPress={loadMore} /> : null}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: colors.textMuted, marginTop: 24 }}>{t("customers.empty")}</Text>
          }
          renderItem={({ item }) => (
            <Row
              c={item} colors={colors} t={t}
              onEdit={() => setModal({ open: true, item })}
              onArchive={() => confirmArchive(item)}
              onUnarchive={() => unarchive.mutate(item.id)}
              onDelete={() => confirmDelete(item)}
            />
          )}
        />
      )}

      {modal.open && (
        <CustomerFormModal customer={modal.item} onClose={() => setModal({ open: false, item: null })} />
      )}
    </DesktopContainer>
  );
}

function Row({
  c, colors, t, onEdit, onArchive, onUnarchive, onDelete,
}: {
  c: Customer; colors: Palette; t: (k: string, o?: Record<string, unknown>) => string;
  onEdit: () => void; onArchive: () => void; onUnarchive: () => void; onDelete: () => void;
}) {
  const archived = c.archived_at != null;
  const meta = [
    c.vat_number ? c.vat_number : null,
    t("customers.termsShort", { days: c.payment_terms_days }),
    c.trip_count > 0 ? t("customers.tripCount", { count: c.trip_count }) : null,
  ].filter(Boolean).join("  ·  ");

  return (
    <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Pressable style={{ flex: 1 }} onPress={onEdit}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{c.name}</Text>
        {meta ? <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 12 }}>{meta}</Text> : null}
        {c.vies_checked_at ? (
          c.vies_valid ? (
            <Text style={{ color: colors.primary, marginTop: 2, fontSize: 12 }}>
              {t("customers.vies.badge", { date: fmtDate(c.vies_checked_at) })}
            </Text>
          ) : (
            <Text style={{ color: colors.warn, marginTop: 2, fontSize: 12 }}>
              {t("customers.vies.badgeInvalid", { date: fmtDate(c.vies_checked_at) })}
            </Text>
          )
        ) : null}
      </Pressable>
      {archived ? (
        <Pressable onPress={onUnarchive} hitSlop={8} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("customers.unarchive")}</Text>
        </Pressable>
      ) : c.trip_count > 0 ? (
        <Pressable onPress={onArchive} hitSlop={8} style={{ padding: 8 }}>
          <Text style={{ color: colors.warn, fontWeight: "600" }}>{t("customers.archive")}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onDelete} hitSlop={8} style={{ padding: 8 }}>
          <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("common.delete")}</Text>
        </Pressable>
      )}
    </View>
  );
}
