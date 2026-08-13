// API sloj za rokove (reminders) — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// MVP obim: lekarsko uverenje vozača kao datumski rok
// (subject_type='driver', category='medical', kind='date', due_date).
// Rok je PODATAK sa izvorom/datumom (pravilo #11), ne procena — ovde ga unosi vlasnik.
import { supabase } from "../../lib/supabase";

export type DriverMedicalReminder = { id: string; due_date: string | null };

// company_id ulogovanog vlasnika (potreban na insertu; RLS ga i proverava).
async function currentCompanyId(): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("Nema aktivne sesije");
  const { data, error } = await supabase
    .from("app_users")
    .select("company_id")
    .eq("id", uid)
    .single();
  if (error) throw error;
  const cid = (data?.company_id as string | null) ?? null;
  if (!cid) throw new Error("Korisnik nije vezan za firmu");
  return cid;
}

// Postojeći medical rok za vozača (ili null).
export async function getDriverMedicalReminder(
  driverId: string,
): Promise<DriverMedicalReminder | null> {
  const { data, error } = await supabase
    .from("reminders")
    .select("id, due_date")
    .eq("subject_type", "driver")
    .eq("subject_id", driverId)
    .eq("category", "medical")
    .eq("kind", "date")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DriverMedicalReminder | null) ?? null;
}

// Upsert medical roka: datum unet -> kreiraj/ažuriraj; datum očišćen -> obriši postojeći.
export async function setDriverMedicalReminder(
  driverId: string,
  dueDate: string | null,
): Promise<void> {
  const existing = await getDriverMedicalReminder(driverId);

  if (dueDate == null) {
    if (existing) {
      const { error } = await supabase.from("reminders").delete().eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from("reminders")
      .update({ due_date: dueDate })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const company_id = await currentCompanyId();
  const { error } = await supabase.from("reminders").insert({
    company_id,
    subject_type: "driver",
    subject_id: driverId,
    category: "medical",
    kind: "date",
    due_date: dueDate,
  });
  if (error) throw error;
}
