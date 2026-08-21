// Reusable sekcija priloga (slike) za trošak (C1) ili turu / „Dokumenti" (C2). Ista putanja
// owner+vozač: izbor -> kompresija -> offline red -> Supabase Storage ('prilozi'). Sinhronizovani se
// prikazuju preko potpisanog GET URL-a; pending sa lokalne putanje + bedž „čeka sinhronizaciju".
//
// Dve upotrebe:
//  - trošak: fiksan `kind` (npr. fuel_receipt), bez izbora vrste.
//  - „Dokumenti" na turi: `pickKind` -> korisnik bira vrstu (cmr/invoice/customs/...) pre dodavanja;
//    vrsta se prikazuje kao mala oznaka na sličici.
import { useState } from "react";
import {
  View, Text, Pressable, Image, ScrollView, ActivityIndicator, Modal, Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Palette } from "../../lib/theme";
import { pickAndCompress, type ImageSource } from "../../lib/image";
import { uuidv4 } from "../../lib/uuid";
import { isWeb } from "../../lib/platform";
import { confirmAction, notify } from "../../lib/confirm";
import { pickImageFile, compressImageForUpload } from "../../lib/webFile";
import {
  listAttachments, listPendingAttachments, enqueueAttachment, uploadAttachmentWeb, signDownload,
  deleteAttachment, deletePendingAttachment,
  ATTACHMENT_KINDS, type AttachmentKind, type Attachment, type PendingAttachment,
} from "./api";

const MAX_WEB_MB = 8; // size-cap za web upload (v1; mobilni komprimuje pre uploada)

const THUMB = 72;

export function AttachmentsSection({
  tripId, expenseId, kind, pickKind, canDelete, colors,
}: {
  tripId?: string;
  expenseId?: string;
  kind?: AttachmentKind;     // fiksna vrsta (trošak); zanemaruje se kad je pickKind
  pickKind?: boolean;        // „Dokumenti": korisnik bira vrstu pre dodavanja
  canDelete: boolean;
  colors: Palette;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [viewUri, setViewUri] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<AttachmentKind>(ATTACHMENT_KINDS[0]);

  const key = expenseId ? ["attachments", "expense", expenseId] : ["attachments", "trip", tripId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => ({
      synced: await listAttachments({ tripId, expenseId }),
      pending: await listPendingAttachments({ tripId, expenseId }),
    }),
    refetchInterval: (query) => ((query.state.data?.pending.length ?? 0) > 0 ? 3000 : false),
  });
  const synced = q.data?.synced ?? [];
  const pending = q.data?.pending ?? [];

  const addFrom = async (source: ImageSource) => {
    setBusy(true);
    try {
      const uri = await pickAndCompress(source);
      if (!uri) return; // odustao ili nema dozvole
      const effectiveKind: AttachmentKind = pickKind ? selectedKind : (kind ?? "other");
      await enqueueAttachment({ id: uuidv4(), trip_id: tripId ?? null, expense_id: expenseId ?? null, kind: effectiveKind, local_uri: uri });
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
    } catch (e) {
      notify({ title: t("common.error"), message: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  // NATIVE-only izbor izvora (kamera/galerija). Na webu se ne poziva (v. isWeb grana dole),
  // pa ostaje RN Alert (troslojni izbor, ne boolean confirm).
  const addPhoto = () =>
    Alert.alert(t("attachment.add"), undefined, [
      { text: t("attachment.camera"), onPress: () => addFrom("camera") },
      { text: t("attachment.library"), onPress: () => addFrom("library") },
      { text: t("common.cancel"), style: "cancel" },
    ]);

  // WEB (F3): izbor fajla sa računara → DIREKTAN upload (bez offline reda). Size-cap MAX_WEB_MB.
  const addFromComputer = async () => {
    const file = await pickImageFile();
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify({ title: t("attachment.imagesOnly") }); return; }
    if (file.size > MAX_WEB_MB * 1024 * 1024) { notify({ title: t("attachment.tooLarge", { mb: MAX_WEB_MB }) }); return; }
    setBusy(true);
    try {
      // Kompresija na uređaju pre uploada (duža strana ~1600px, JPEG ~0.8) — kao mobilni tok, lakši fajl.
      const { bytes, contentType } = await compressImageForUpload(file, { maxEdge: 1600, quality: 0.8 });
      const effectiveKind: AttachmentKind = pickKind ? selectedKind : (kind ?? "other");
      await uploadAttachmentWeb({ id: uuidv4(), trip_id: tripId ?? null, expense_id: expenseId ?? null, kind: effectiveKind, bytes, contentType });
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      notify({ title: t("common.error"), message: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  // Pregled: web otvara u NOVOM TABU (signed URL); native puni modal.
  const openView = (uri: string) => { if (isWeb) window.open(uri, "_blank"); else setViewUri(uri); };

  const confirmDelete = async (id: string) => {
    const ok = await confirmAction({
      title: t("attachment.deleteConfirm"), confirmLabel: t("common.delete"), cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await deleteAttachment(id);
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      notify({ title: t("common.error"), message: String((e as Error).message ?? e) });
    }
  };

  // Brisanje PENDING priloga (pre sinhronizacije): iz reda + lokalni fajl.
  const confirmDeletePending = async (p: PendingAttachment) => {
    const ok = await confirmAction({
      title: t("attachment.deleteConfirm"), confirmLabel: t("common.delete"), cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    try {
      await deletePendingAttachment(p.queueId, p.local_uri);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
    } catch (e) {
      notify({ title: t("common.error"), message: String((e as Error).message ?? e) });
    }
  };

  const hasAny = synced.length > 0 || pending.length > 0;

  return (
    <View style={{ gap: 8 }}>
      {/* Izbor vrste dokumenta (samo „Dokumenti" na turi) */}
      {pickKind ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("attachment.kindLabel")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ATTACHMENT_KINDS.map((k) => {
              const active = selectedKind === k;
              return (
                <Pressable key={k} onPress={() => setSelectedKind(k)}
                  style={{
                    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : colors.surface,
                  }}>
                  <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: 13 }}>{t(`attachment.kind.${k}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {pending.map((p) => (
          <View key={`p-${p.queueId}`}>
            <Pressable onPress={() => openView(p.local_uri)}>
              <Image source={{ uri: p.local_uri }} style={{ width: THUMB, height: THUMB, borderRadius: 8, borderWidth: 1, borderColor: colors.warn }} />
              {pickKind ? <KindTag label={t(`attachment.kind.${p.kind}`)} colors={colors} /> : null}
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.warn, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                <Text numberOfLines={1} style={{ color: colors.onPrimary, fontSize: 8, textAlign: "center", fontWeight: "700" }}>
                  {t("expense.pending")}
                </Text>
              </View>
            </Pressable>
            {canDelete ? (
              <Pressable onPress={() => confirmDeletePending(p)} hitSlop={6}
                style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: "700", lineHeight: 14 }}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {synced.map((a) => (
          <SyncedThumb key={a.id} a={a} colors={colors} canDelete={canDelete} showKind={!!pickKind}
            onView={openView} onDelete={confirmDelete} />
        ))}

        {/* Dodaj sliku (native: kamera/galerija; web: fajl sa računara) */}
        <Pressable onPress={isWeb ? addFromComputer : addPhoto} disabled={busy}
          style={{
            width: THUMB, height: THUMB, borderRadius: 8, borderWidth: 1, borderStyle: "dashed",
            borderColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1,
          }}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontSize: 24 }}>＋</Text>}
        </Pressable>
      </ScrollView>

      {!hasAny ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("attachment.empty")}</Text> : null}

      {/* Pun prikaz */}
      <Modal visible={viewUri != null} transparent animationType="fade" onRequestClose={() => setViewUri(null)}>
        <Pressable onPress={() => setViewUri(null)} style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" }}>
          {viewUri ? <Image source={{ uri: viewUri }} style={{ width: "92%", height: "80%" }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

// Mala oznaka vrste dokumenta (gore-levo na sličici).
function KindTag({ label, colors }: { label: string; colors: Palette }) {
  return (
    <View style={{ position: "absolute", top: 0, left: 0, backgroundColor: colors.primary, borderTopLeftRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
      <Text numberOfLines={1} style={{ color: colors.onPrimary, fontSize: 8, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

// Sinhronizovana sličica: povuče potpisani GET URL (keširano) pa prikaže Image.
function SyncedThumb({
  a, colors, canDelete, showKind, onView, onDelete,
}: {
  a: Attachment;
  colors: Palette;
  canDelete: boolean;
  showKind: boolean;
  onView: (uri: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const urlQ = useQuery({
    queryKey: ["attachment-url", a.storage_key],
    queryFn: () => signDownload(a.storage_key),
    staleTime: 8 * 60_000, // potpisani GET važi ~10 min
  });

  return (
    <View>
      <Pressable onPress={() => urlQ.data && onView(urlQ.data)}
        style={{ width: THUMB, height: THUMB, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        {urlQ.data ? (
          <Image source={{ uri: urlQ.data }} style={{ width: THUMB, height: THUMB }} />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </Pressable>
      {showKind ? <KindTag label={t(`attachment.kind.${a.kind}`)} colors={colors} /> : null}
      {canDelete ? (
        <Pressable onPress={() => onDelete(a.id)} hitSlop={6}
          style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: "700", lineHeight: 14 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
