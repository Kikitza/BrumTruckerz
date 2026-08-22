// „Mrežni profil" radnika (v2-3 kriška 2, ADR 0014). Radnik gradi profil za vidljivost
// tržištu; VIDLJIVOST je opt-in (podrazumevano PRIVATNO) uz jasno objašnjenje šta firma vidi.
// Sertifikati su SAMODEKLARISANI (UI to izričito označava). Sav pristup bazi kroz api sloj.
// Boje iz tokena (#8), stringovi kroz t() (#7).
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { Field, PickerField, DateField } from "../../components/form";
import { CountryPickerField } from "../company/CountryPickerField";
import { listCountries } from "../company/api";
import { LANGUAGES } from "../../i18n/languages";
import { notify } from "../../lib/confirm";
import { Tag } from "./Tag";
import { certList } from "./searchParams";
import { getMyNetworkProfile, upsertMyNetworkProfile, type NetworkProfile, type SeekingRole } from "./api";

const EMPTY: NetworkProfile = {
  visibility: "private", seeking_role: null, countries_of_interest: [],
  languages: [], available_from: null, certificates: [], note: null,
};

export function NetworkProfileEditor() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-network-profile"], queryFn: getMyNetworkProfile });
  const countriesQ = useQuery({ queryKey: ["countries"], queryFn: listCountries });

  const [draft, setDraft] = useState<NetworkProfile>(EMPTY);
  const [certInput, setCertInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Popuni nacrt kad stigne server (ili ostavi prazne podrazumevane vrednosti).
  useEffect(() => {
    if (q.data) setDraft({ ...EMPTY, ...q.data, certificates: certList(q.data.certificates) });
  }, [q.data]);

  if (q.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />;

  const set = <K extends keyof NetworkProfile>(k: K, v: NetworkProfile[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const certs = certList(draft.certificates);

  const countryName = (code: string) => {
    const c = countriesQ.data?.find((x) => x.code === code);
    return c ? `${t(c.name_key)} (${c.code})` : code;
  };
  const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

  const addCountry = (code: string | null) => {
    if (code && !draft.countries_of_interest.includes(code)) set("countries_of_interest", [...draft.countries_of_interest, code]);
  };
  const addLang = (code: string | null) => {
    if (code && !draft.languages.includes(code)) set("languages", [...draft.languages, code]);
  };
  const addCert = () => {
    const v = certInput.trim();
    if (v && !certs.includes(v)) { set("certificates", [...certs, v]); setCertInput(""); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await upsertMyNetworkProfile({ ...draft, certificates: certs });
      qc.invalidateQueries({ queryKey: ["my-network-profile"] });
      await notify({ title: t("network.profile.saved"), okLabel: t("common.done") });
    } catch (e) {
      const msg = String((e as Error).message ?? e).toUpperCase();
      await notify({ title: msg.includes("INVALID_COUNTRY") ? t("network.profile.invalidCountry") : t("common.error") });
    } finally {
      setSaving(false);
    }
  };

  const visible = draft.visibility === "visible";

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("network.profile.title")}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("network.profile.hint")}</Text>
      </View>

      {/* Vidljivost — jasan prekidač, PRIVATNO podrazumevano, objašnjenje šta firma vidi. */}
      <View style={{ gap: 8, borderWidth: 1, borderColor: visible ? colors.primary : colors.border, borderRadius: 10, padding: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["private", "visible"] as const).map((opt) => (
            <Pressable key={opt} onPress={() => set("visibility", opt)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8, borderWidth: 1,
                borderColor: draft.visibility === opt ? colors.primary : colors.border,
                backgroundColor: draft.visibility === opt ? colors.primary : colors.surface }}>
              <Text style={{ color: draft.visibility === opt ? colors.onPrimary : colors.text, fontWeight: "700" }}>
                {t(`network.profile.visibility.${opt}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {t(visible ? "network.profile.visibility.explainVisible" : "network.profile.visibility.explainPrivate")}
        </Text>
      </View>

      <PickerField
        label={t("network.profile.seekingRole")}
        value={draft.seeking_role}
        placeholder={t("network.profile.seekingRolePlaceholder")}
        clearLabel={t("country.none")}
        options={(["driver", "dispatcher"] as SeekingRole[]).map((r) => ({ value: r, label: t(`network.role.${r}`) }))}
        onSelect={(v) => set("seeking_role", (v as SeekingRole) ?? null)}
        colors={colors}
      />

      {/* Zemlje interesa — ODVOJENO od rute/prebivališta (data-collision guard, ADR 0014 §5). */}
      <View style={{ gap: 8 }}>
        <CountryPickerField label={t("network.profile.countriesOfInterest")} value={null} onSelect={addCountry} allowClear={false} />
        {draft.countries_of_interest.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {draft.countries_of_interest.map((c) => (
              <Tag key={c} label={countryName(c)} onRemove={() => set("countries_of_interest", draft.countries_of_interest.filter((x) => x !== c))} />
            ))}
          </View>
        )}
      </View>

      {/* Jezici */}
      <View style={{ gap: 8 }}>
        <PickerField
          label={t("network.profile.languages")}
          value={null}
          placeholder={t("network.profile.addLanguage")}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          onSelect={addLang}
          colors={colors}
        />
        {draft.languages.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {draft.languages.map((l) => (
              <Tag key={l} label={langName(l)} onRemove={() => set("languages", draft.languages.filter((x) => x !== l))} />
            ))}
          </View>
        )}
      </View>

      <DateField label={t("network.profile.availableFrom")} value={draft.available_from} onChange={(v) => set("available_from", v)} colors={colors} placeholder={t("network.profile.availableFromPlaceholder")} />

      {/* Sertifikati — SAMODEKLARISANI (jasno označeno). */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("network.profile.certificates")}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontStyle: "italic" }}>{t("network.profile.selfDeclared")}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Field label="" value={certInput} onChangeText={setCertInput} placeholder={t("network.profile.certPlaceholder")} colors={colors} />
          </View>
          <Pressable onPress={addCert} style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{t("common.add")}</Text>
          </Pressable>
        </View>
        {certs.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {certs.map((c) => <Tag key={c} label={c} onRemove={() => set("certificates", certs.filter((x) => x !== c))} />)}
          </View>
        )}
      </View>

      <Field label={t("network.profile.note")} value={draft.note ?? ""} onChangeText={(v) => set("note", v || null)} placeholder={t("network.profile.notePlaceholder")} colors={colors} />

      <Pressable onPress={save} disabled={saving}
        style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center", opacity: saving ? 0.5 : 1 }}>
        <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{saving ? t("common.saving") : t("common.save")}</Text>
      </Pressable>
    </View>
  );
}
