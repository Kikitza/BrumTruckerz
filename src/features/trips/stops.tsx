// Stanice ture — reusable UI (bez dupliranja):
//  * StopsEditor — kontrolisana lista nacrta (unos): koristi čarobnjak „Nova tura"
//    (i kasnije „Izmeni turu"). Ne priča sa API-jem; roditelj drži niz i snima ga.
//  * RouteView — read-only uređen prikaz (polazak → utovari/istovari): koristi
//    detalj ture (vlasnik) i ekran vozača. Stare ture bez stanica: origin→destination.
import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Field } from "../../components/form";
import { CountryPickerField } from "../company/CountryPickerField";
import { confirmAction } from "../../lib/confirm";
import { detectCountry } from "./countryDetect";
import type { Palette } from "../../lib/theme";
import { tripTitle, type TripStop, type TripStopKind, type TripStopInput, type CountrySource } from "./api";

// ── Unos (nacrti) ──
// existingId = veza ka redu u bazi (za „Izmeni turu"); null = nova stanica.
export type StopDraft = {
  key: string; existingId: string | null; kind: TripStopKind; place: string; note: string;
  country: string | null; countrySource: CountrySource | null;
};

let stopSeq = 0;
export const newStopDraft = (kind: TripStopKind): StopDraft => ({
  key: `stop-${stopSeq++}`, existingId: null, kind, place: "", note: "", country: null, countrySource: null,
});
// Podrazumevano: jedan utovar + jedan istovar.
export const defaultStopDrafts = (): StopDraft[] => [newStopDraft("loading"), newStopDraft("unloading")];

// Postojeće stanice -> nacrti (popunjavanje forme „Izmeni turu").
export const stopsToDrafts = (stops: TripStop[]): StopDraft[] =>
  stops.map((s) => ({
    key: `existing-${s.id}`, existingId: s.id, kind: s.kind, place: s.place, note: s.note ?? "",
    country: s.country_code ?? null, countrySource: s.country_source ?? null,
  }));

// Nacrti -> ulaz za api (redosled = redosled u nizu; sanitizacija je u ownerCreateTrip).
export const draftsToInput = (drafts: StopDraft[]): TripStopInput[] =>
  drafts.map((d) => ({ kind: d.kind, place: d.place, note: d.note, country_code: d.country, country_source: d.countrySource }));

// Auto-predlog zemlje pri promeni mesta: puni SAMO ako je prazno ili je prethodno bilo 'auto'
// (ručni izbor korisnika se ne pregazuje). Siguran predlog → country + source 'auto'.
export function autoCountryPatch(place: string, current: { country: string | null; countrySource: CountrySource | null }): Partial<StopDraft> {
  if (current.country && current.countrySource === "manual") return {}; // poštuj ručni izbor
  const g = detectCountry(place);
  if (g.confident && g.code) return { country: g.code, countrySource: "auto" };
  if (current.countrySource === "auto") return { country: null, countrySource: null }; // više nije jasno
  return {};
}

const kindAccent = (kind: TripStopKind, colors: Palette) => (kind === "loading" ? colors.primary : colors.warn);

export function StopsEditor({
  items, onChange, colors,
}: { items: StopDraft[]; onChange: (next: StopDraft[]) => void; colors: Palette }) {
  const { t } = useTranslation();
  const update = (key: string, patch: Partial<StopDraft>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const confirmRemove = async (key: string) => {
    const ok = await confirmAction({
      title: t("trip.stops.deleteConfirm"), confirmLabel: t("common.delete"), cancelLabel: t("common.cancel"),
    });
    if (ok) onChange(items.filter((i) => i.key !== key));
  };

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
            onChangeText={(s) => update(it.key, { place: s, ...autoCountryPatch(s, it) })} autoCapitalize="sentences" colors={colors} />
          {/* Zemlja stanice (auto-predlog iz mesta; ručni izbor je konačan). Prazno ne blokira čuvanje. */}
          <CountryPickerField
            label={it.country ? t("trip.stops.country") : t("trip.stops.countryHint")}
            value={it.country}
            onSelect={(code) => update(it.key, { country: code, countrySource: code ? "manual" : null })}
          />
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
// arrivals: stop_id -> km (✓ + km uz stigle stanice); prazno = bez oznaka.
export function RouteView({
  origin, destination, stops, colors, arrivals,
}: {
  origin: string | null; destination: string | null; stops: TripStop[];
  colors: Palette; arrivals?: Record<string, number>;
}) {
  const { t } = useTranslation();

  // Stare ture bez stanica: origin → destination kao do sada.
  if (stops.length === 0) {
    return <Text style={{ color: colors.text, fontWeight: "600" }}>{tripTitle(origin, destination) ?? "—"}</Text>;
  }

  return (
    <View style={{ gap: 6 }}>
      {origin ? <RouteRow place={origin} label={t("trip.stops.departure")} accent={colors.textMuted} colors={colors} /> : null}
      {stops.map((s) => (
        <RouteRow key={s.id} place={s.place} note={s.note} label={t(`trip.stops.${s.kind}`)}
          accent={kindAccent(s.kind, colors)} colors={colors} arrivedKm={arrivals?.[s.id]} />
      ))}
    </View>
  );
}

function RouteRow({
  place, note, label, accent, colors, arrivedKm,
}: { place: string; note?: string | null; label: string; accent: string; colors: Palette; arrivedKm?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
      <Text style={{ flex: 1, color: colors.text }}>{place}{note ? ` · ${note}` : ""}</Text>
      {arrivedKm != null && (
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>✓ {arrivedKm} km</Text>
      )}
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
