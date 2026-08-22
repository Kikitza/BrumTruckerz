// Aktivnost (v2-2): kancelarijski „živi" feed domenskih evenata iz outbox_events.
// Prvi POTROŠAČ event/outbox sloja (ADR 0012, consumer (a) — Realtime tabla).
// RLS na outbox_events pušta office ulogu da čita SAMO svoju firmu; ovaj sloj
// samo čita + pretplata. Nikad ne piše u outbox (upis ide kroz trigere u bazi).
import { supabase } from "../../lib/supabase";

export type ActivityEvent = {
  id: string;
  occurred_at: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
};

export async function listRecentActivity(limit = 15): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from("outbox_events")
    .select("id, occurred_at, event_type, aggregate_type, aggregate_id, payload")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityEvent[];
}

// Realtime pretplata na NOVE evente svoje firme (RLS filtrira po firmi). Vrati cleanup.
// Web je uvek online; native takođe koristi websocket. Ako kanal padne, feed i dalje
// prikazuje poslednje povučeno (bez živog osvežavanja) — nije kritičan put.
export function subscribeActivity(onInsert: () => void): () => void {
  const channel = supabase
    .channel("outbox-activity")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "outbox_events" }, () => onInsert())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
