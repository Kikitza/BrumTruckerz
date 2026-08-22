// Živi feed aktivnosti (v2-2 kriška 1) — dokaz kraj-na-kraj event/outbox sloja:
// poslovna promena → outbox event (trigeri) → Realtime → ova lista se sama osvežava.
// Sklopiva kartica; boje iz tokena, stringovi kroz t(), vreme kroz fmtDateTime.
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { fmtDateTime } from "../../lib/format";
import { listRecentActivity, subscribeActivity, type ActivityEvent } from "./api";

// event_type → i18n ključ labele. Nepoznat tip → prikaži sirov tip (bez pada).
const LABEL_KEY: Record<string, string> = {
  "trip.created": "activity.event.trip_created",
  "driver.assigned": "activity.event.driver_assigned",
  "route.changed": "activity.event.route_changed",
  "trip.status_changed": "activity.event.trip_status_changed",
  "trip.completed": "activity.event.trip_completed",
  "document.uploaded": "activity.event.document_uploaded",
  "invoice.issued": "activity.event.invoice_issued",
  "invoice.paid": "activity.event.invoice_paid",
  "invoice.cancelled": "activity.event.invoice_cancelled",
  "employment.started": "activity.event.employment_started",
  "employment.ended": "activity.event.employment_ended",
  "customer.created": "activity.event.customer_created",
  "reminder.due": "activity.event.reminder_due",
  "marketplace.invite.sent": "activity.event.marketplace_invite_sent",
};

export function ActivityFeed() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({ queryKey: ["activity"], queryFn: () => listRecentActivity(15), enabled: open });

  // Realtime: nov event → osveži listu. Pretplata živi dok je kartica otvorena.
  useEffect(() => {
    if (!open) return;
    const off = subscribeActivity(() => qc.invalidateQueries({ queryKey: ["activity"] }));
    return off;
  }, [open, qc]);

  const rows = q.data ?? [];

  return (
    <View style={{ marginHorizontal: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12 }}
      >
        <Text style={{ color: colors.textMuted, width: 14, fontSize: 12 }}>{open ? "▾" : "▸"}</Text>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{t("activity.title")}</Text>
      </Pressable>

      {open && (
        q.isLoading ? (
          <ActivityIndicator style={{ marginVertical: 14 }} color={colors.primary} />
        ) : rows.length === 0 ? (
          <Text style={{ color: colors.textMuted, paddingHorizontal: 14, paddingBottom: 14 }}>{t("activity.empty")}</Text>
        ) : (
          <View>
            {rows.map((e) => <ActivityRow key={e.id} event={e} colors={colors} label={LABEL_KEY[e.event_type] ? t(LABEL_KEY[e.event_type]) : e.event_type} />)}
          </View>
        )
      )}
    </View>
  );
}

function ActivityRow({ event, colors, label }: { event: ActivityEvent; colors: Palette; label: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text style={{ color: colors.text, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 10 }}>{fmtDateTime(event.occurred_at)}</Text>
    </View>
  );
}
