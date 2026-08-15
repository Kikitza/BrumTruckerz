// Stanice ture — reusable UI (bez dupliranja):
//  * StopsEditor — kontrolisana lista nacrta (unos): koristi čarobnjak „Nova tura"
//    (i kasnije „Izmeni turu"). Ne priča sa API-jem; roditelj drži niz i snima ga.
//  * RouteView — read-only uređen prikaz (polazak → utovari/istovari): koristi
//    detalj ture (vlasnik) i ekran vozača. Stare ture bez stanica: origin→destination.
import { View, Text, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Field } from "../../components/form";
import type { Palette } from "../../lib/theme";
import { tripTitle, type TripStop, type TripStopKind, type TripStopInput } from "./api";

// ── Unos (nacrti) ──
export type StopDraft = { key: string; kind: TripStopKind; place: string; note: string };

let stopSeq = 0;
export const newStopDraft = (kind: TripStopKind): StopDraft => ({
  key: `stop-${stopSeq++}`, kind, place: "", note: "",
});
// Podrazumevano: jedan utovar + jedan istovar.
export const defaultStopDrafts = (): StopDraft[] => [newStopDraft("loading"), newStopDraft("unloading")];

// Nacrti -> ulaz za api (redosled = redosled u nizu; sanitizacija je u ownerCreateTrip).
export const draftsToInput = (drafts: StopDraft[]): TripStopInput[] =>
  drafts.map((d) => ({ kind: d.kind, place: d.place, note: d.note }));

const kindAccent = (kind: TripStopKind, colors: Palette) => (kind === "loading" ? colors.primary : colors.warn);

export function StopsEditor({
  items, onChange, colors,
}: { items: StopDraft[]; onChange: (next: StopDraft[]) => void; colors: Palette }) {
  const { t } = useTranslation();
  const update = (key: string, patch: Partial<StopDraft>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const confirmRemove = (key: string) =>
    Alert.alert(t("trip.stops.deleteConfirm"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => onChange(items.filter((i) => i.key !== key)) },
    ]);

  return (
    <View style={{ gap: 12 }}>
      {items.map((it) => (
        <View
          key={it.key}
          style={{
            gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12,
            backgroundColor: colors.surface, borderLeftWidth: 4, borderLeftColor: kindAccent(it.kind, colors),
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{t(`trip.stops.${it.kind}`)}</Text>
            <Pressable onPress={() => confirmRemove(it.key)} hitSlop={8} style={{ padding: 4 }}>
              <Text style={{ color: colors.danger, fontSize: 20, lineHeight: 20 }}>×</Text>
            </Pressable>
          </View>
          <Field label={t("trip.stops.place")} value={it.place}
            onChangeText={(s) => update(it.key, { place: s })} autoCapitalize="sentences" colors={colors} />
          <Field label={t("trip.fields.note")} value={it.note}
            onChangeText={(s) => update(it.key, { note: s })} colors={colors} />
        </View>
      ))}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <AddStopButton label={t("trip.stops.addLoading")} onPress={() => onChange([...items, newStopDraft("loading")])} colors={colors} />
        <AddStopButton label={t("trip.stops.addUnloading")} onPress={() => onChange([...items, newStopDraft("unloading")])} colors={colors} />
      </View>
    </View>
  );
}

function AddStopButton({ label, onPress, colors }: { label: string; onPress: () => void; colors: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}
    >
      <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

// ── Prikaz (read-only, uređen redosled) ──
export function RouteView({
  origin, destination, stops, colors,
}: { origin: string | null; destination: string | null; stops: TripStop[]; colors: Palette }) {
  const { t } = useTranslation();

  // Stare ture bez stanica: origin → destination kao do sada.
  if (stops.length === 0) {
    return <Text style={{ color: colors.text, fontWeight: "600" }}>{tripTitle(origin, destination) ?? "—"}</Text>;
  }

  return (
    <View style={{ gap: 6 }}>
      {origin ? <RouteRow place={origin} label={t("trip.stops.departure")} accent={colors.textMuted} colors={colors} /> : null}
      {stops.map((s) => (
        <RouteRow key={s.id} place={s.place} note={s.note} label={t(`trip.stops.${s.kind}`)} accent={kindAccent(s.kind, colors)} colors={colors} />
      ))}
    </View>
  );
}

function RouteRow({
  place, note, label, accent, colors,
}: { place: string; note?: string | null; label: string; accent: string; colors: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
      <Text style={{ flex: 1, color: colors.text }}>{place}{note ? ` · ${note}` : ""}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
