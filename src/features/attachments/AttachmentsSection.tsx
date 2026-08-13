// Reusable sekcija priloga (slike) za trošak (C1) ili turu (C2). Ista putanja owner+vozač:
// izbor -> kompresija -> offline red -> R2. Sinhronizovani se prikazuju preko presigned GET;
// pending sa lokalne putanje + bedž „čeka sinhronizaciju". Brisanje samo vlasnik.
import { useState } from "react";
import {
  View, Text, Pressable, Image, ScrollView, ActivityIndicator, Modal, Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Palette } from "../../lib/theme";
import { pickAndCompress, type ImageSource } from "../../lib/image";
import { uuidv4 } from "../../lib/uuid";
import {
  listAttachments, listPendingAttachments, enqueueAttachment, signDownload, deleteAttachment,
  type AttachmentKind, type Attachment,
} from "./api";

const THUMB = 72;

export function AttachmentsSection({
  tripId, expenseId, kind, canDelete, colors,
}: {
  tripId?: string;
  expenseId?: string;
  kind: AttachmentKind;
  canDelete: boolean;
  colors: Palette;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [viewUri, setViewUri] = useState<string | null>(null);

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
      await enqueueAttachment({ id: uuidv4(), trip_id: tripId ?? null, expense_id: expenseId ?? null, kind, local_uri: uri });
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
    } catch (e) {
      Alert.alert(t("common.error"), String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = () =>
    Alert.alert(t("attachment.add"), undefined, [
      { text: t("attachment.camera"), onPress: () => addFrom("camera") },
      { text: t("attachment.library"), onPress: () => addFrom("library") },
      { text: t("common.cancel"), style: "cancel" },
    ]);

  const confirmDelete = (id: string) =>
    Alert.alert(t("attachment.deleteConfirm"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive",
        onPress: async () => {
          try {
            await deleteAttachment(id);
            qc.invalidateQueries({ queryKey: key });
          } catch (e) {
            Alert.alert(t("common.error"), String((e as Error).message ?? e));
          }
        },
      },
    ]);

  const hasAny = synced.length > 0 || pending.length > 0;

  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {pending.map((p) => (
          <Pressable key={`p-${p.queueId}`} onPress={() => setViewUri(p.local_uri)}>
            <Image source={{ uri: p.local_uri }} style={{ width: THUMB, height: THUMB, borderRadius: 8, borderWidth: 1, borderColor: colors.warn }} />
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.warn, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
              <Text numberOfLines={1} style={{ color: colors.onPrimary, fontSize: 8, textAlign: "center", fontWeight: "700" }}>
                {t("expense.pending")}
              </Text>
            </View>
          </Pressable>
        ))}
        {synced.map((a) => (
          <SyncedThumb key={a.id} a={a} colors={colors} canDelete={canDelete}
            onView={setViewUri} onDelete={confirmDelete} />
        ))}

        {/* Dodaj sliku */}
        <Pressable onPress={addPhoto} disabled={busy}
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

// Sinhronizovana sličica: povuče presigned GET URL (keširano) pa prikaže Image.
function SyncedThumb({
  a, colors, canDelete, onView, onDelete,
}: {
  a: Attachment;
  colors: Palette;
  canDelete: boolean;
  onView: (uri: string) => void;
  onDelete: (id: string) => void;
}) {
  const urlQ = useQuery({
    queryKey: ["attachment-url", a.storage_key],
    queryFn: () => signDownload(a.storage_key),
    staleTime: 8 * 60_000, // presigned GET važi ~10 min
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
      {canDelete ? (
        <Pressable onPress={() => onDelete(a.id)} hitSlop={6}
          style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: "700", lineHeight: 14 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
