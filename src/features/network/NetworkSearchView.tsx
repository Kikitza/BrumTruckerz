// „Mreža" — office pretraga radnika (v2-3 kriška 2, ADR 0014). Rezultat su JAVNE KARTICE
// BEZ PII (bez imena/kontakta) — samo javni broj (BT-D/BT-T), preferencije i samodeklarisani
// sertifikati. „Pozovi" kreira ciljanu pozivnicu (ista kapija). Sav pristup bazi kroz api sloj.
import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { PickerField } from "../../components/form";
import { CountryPickerField } from "../company/CountryPickerField";
import { listCountries } from "../company/api";
import { LANGUAGES } from "../../i18n/languages";
import { fmtDate } from "../../lib/format";
import { notify } from "../../lib/confirm";
import { Tag } from "./Tag";
import { certList, type NetworkFilters } from "./searchParams";
import { searchNetwork, inviteWorker, type NetworkCard, type SeekingRole } from "./api";
import { cvAccess, cvRequest } from "../cv/api";
import { CareerProfileModal } from "../career/CareerProfileModal";

const EMPTY_FILTERS: NetworkFilters = { role: null, country: null, language: null, availableOnly: false };

export function NetworkSearchView() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const countriesQ = useQuery({ queryKey: ["countries"], queryFn: listCountries });

  const [filters, setFilters] = useState<NetworkFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<NetworkFilters | null>(null);
  const [sent, setSent] = useState<Record<string, "sent" | "already_pending">>({});

  const resultsQ = useQuery({
    queryKey: ["network-search", applied],
    queryFn: () => searchNetwork(applied as NetworkFilters),
    enabled: applied !== null,
  });

  const invite = useMutation({
    mutationFn: ({ card }: { card: NetworkCard }) => inviteWorker(card.user_id, (card.seeking_role ?? "driver") as SeekingRole),
    onSuccess: (res, { card }) => setSent((s) => ({ ...s, [card.user_id]: res.status })),
    onError: () => notify({ title: t("common.error") }),
  });

  const set = <K extends keyof NetworkFilters>(k: K, v: NetworkFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const countryName = (code: string) => {
    const c = countriesQ.data?.find((x) => x.code === code);
    return c ? `${t(c.name_key)} (${c.code})` : code;
  };
  const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

  const cards = resultsQ.data ?? [];

  return (
    <View style={{ padding: 16, gap: 16 }}>
      {/* Filteri */}
      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 12 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("network.search.filters")}</Text>
        <PickerField
          label={t("network.search.role")}
          value={filters.role}
          placeholder={t("network.search.anyRole")}
          clearLabel={t("network.search.anyRole")}
          options={(["driver", "dispatcher"] as SeekingRole[]).map((r) => ({ value: r, label: t(`network.role.${r}`) }))}
          onSelect={(v) => set("role", v)}
          colors={colors}
        />
        <CountryPickerField label={t("network.search.country")} value={filters.country} onSelect={(v) => set("country", v)} />
        <PickerField
          label={t("network.search.language")}
          value={filters.language}
          placeholder={t("network.search.anyLanguage")}
          clearLabel={t("network.search.anyLanguage")}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          onSelect={(v) => set("language", v)}
          colors={colors}
        />
        <Pressable onPress={() => set("availableOnly", !filters.availableOnly)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: filters.availableOnly ? colors.primary : colors.border, backgroundColor: filters.availableOnly ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
            {filters.availableOnly && <Text style={{ color: colors.onPrimary, fontWeight: "900", fontSize: 13 }}>✓</Text>}
          </View>
          <Text style={{ color: colors.text }}>{t("network.search.availableOnly")}</Text>
        </Pressable>
        <Pressable onPress={() => setApplied({ ...filters })} style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center" }}>
          <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{t("network.search.search")}</Text>
        </Pressable>
      </View>

      {/* Rezultati */}
      {applied === null ? null : resultsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : cards.length === 0 ? (
        <Text style={{ color: colors.textMuted, textAlign: "center", marginVertical: 24 }}>{t("network.search.empty")}</Text>
      ) : (
        cards.map((card) => (
          <NetworkCardView key={card.user_id} card={card} sent={sent[card.user_id]} busy={invite.isPending}
            onInvite={() => invite.mutate({ card })} countryName={countryName} langName={langName} />
        ))
      )}
    </View>
  );
}

function NetworkCardView({
  card, sent, busy, onInvite, countryName, langName,
}: {
  card: NetworkCard; sent?: "sent" | "already_pending"; busy: boolean; onInvite: () => void;
  countryName: (c: string) => string; langName: (c: string) => string;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const certs = certList(card.certificates);

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text selectable style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{card.public_no ?? "—"}</Text>
        {card.seeking_role && <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{t(`network.role.${card.seeking_role}`)}</Text>}
      </View>

      {card.countries_of_interest.length > 0 && (
        <Labeled label={t("network.search.countriesOfInterest")}>
          {card.countries_of_interest.map((c) => <Tag key={c} label={countryName(c)} />)}
        </Labeled>
      )}
      {card.languages.length > 0 && (
        <Labeled label={t("network.profile.languages")}>
          {card.languages.map((l) => <Tag key={l} label={langName(l)} />)}
        </Labeled>
      )}
      {card.available_from && (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("network.search.availableFrom", { date: fmtDate(card.available_from) })}</Text>
      )}
      {certs.length > 0 && (
        <Labeled label={`${t("network.profile.certificates")} · ${t("network.profile.selfDeclared")}`}>
          {certs.map((c) => <Tag key={c} label={c} />)}
        </Labeled>
      )}
      {card.note ? <Text style={{ color: colors.text, fontSize: 14 }}>{card.note}</Text> : null}

      {sent ? (
        <View style={{ borderRadius: 8, padding: 12, alignItems: "center", backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textMuted, fontWeight: "700" }}>
            {t(sent === "already_pending" ? "network.search.invitePending" : "network.search.invited")}
          </Text>
        </View>
      ) : (
        <Pressable onPress={onInvite} disabled={busy}
          style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
          <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{t("network.search.invite")}</Text>
        </Pressable>
      )}

      <CardCvAction workerUserId={card.user_id} />
    </View>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

// CV akcija na kartici: „Zatraži CV" (none) / „CV zatražen" (requested) / „Pogledaj CV" (granted).
// Pun CV se prikazuje kroz reuse CareerProfileModal — RPC-ovi vraćaju consented pun pogled.
function CardCvAction({ workerUserId }: { workerUserId: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [viewCv, setViewCv] = useState(false);
  const q = useQuery({ queryKey: ["cv-access", workerUserId], queryFn: () => cvAccess(workerUserId) });

  const request = useMutation({
    mutationFn: () => cvRequest(workerUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cv-access", workerUserId] }),
    onError: () => notify({ title: t("common.error") }),
  });

  const access = q.data ?? "none";
  if (q.isLoading) return null;

  if (access === "granted") {
    return (
      <>
        <Pressable onPress={() => setViewCv(true)}
          style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("cv.card.view")}</Text>
        </Pressable>
        {viewCv && <CareerProfileModal userId={workerUserId} onClose={() => setViewCv(false)} />}
      </>
    );
  }
  if (access === "requested") {
    return (
      <View style={{ borderRadius: 8, padding: 12, alignItems: "center", backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.textMuted, fontWeight: "700" }}>{t("cv.card.requested")}</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={() => request.mutate()} disabled={request.isPending}
      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center", opacity: request.isPending ? 0.5 : 1 }}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{t("cv.card.request")}</Text>
    </Pressable>
  );
}
