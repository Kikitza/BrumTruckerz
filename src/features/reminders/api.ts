// API sloj za rokove (reminders) — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
//
// Rok je PODATAK sa izvorom/datumom (pravilo #11), ne AI procena — unosi ga vlasnik.
// Rokovi su polimorfni: subject_type (vehicle|trailer|driver) + subject_id + category.
//   * predefinisane kategorije (registration, fire_extinguisher, medical, …): JEDAN rok
//     po (subjekat, kategorija) — get/setDateReminder rade upsert po tom ključu.
//   * custom kategorija ('custom'): VIŠE stavki po subjektu, svaka sa svojim label i id
//     — list/add/save/deleteReminder rade po id-u.
// Owner tok je online; RLS na reminders (reminders_tenant) proverava company_id.
import { supabase } from "../../lib/supabase";

export type ReminderSubjectType = "vehicle" | "trailer" | "driver";

// Datumski rok (kind='date'). issued_at/label su opcioni (migracija 0004).
export type DateReminder = {
  id: string;
  category: string;
  label: string | null;
  due_date: string | null; // 'YYYY-MM-DD'
  issued_at: string | null; // 'YYYY-MM-DD' (npr. datum atesta)
};

export type ReminderMode = "date" | "km";

// Red za ekran "Rokovi": rok + razrešeno ime subjekta + tip/režim/km (0024).
export type ReminderRow = DateReminder & {
  subject_type: ReminderSubjectType;
  subject_id: string;
  subject_name: string;
  type_id: string | null;
  type_name_key: string | null; // i18n ključ tipa (join reminder_types)
  country_code: string | null;
  mode: ReminderMode;
  due_km: number | null;
  subject_odometer: number | null; // trenutna kilometraža vozila (za km-semafor)
};

// ── Šifarnik tipova rokova (0024): svi authenticated čitaju; menja samo platforma ──
export type ReminderTypeCatalog = {
  id: string;
  code: string;
  subject_kind: ReminderSubjectType;
  name_key: string;
  default_interval_months: number | null;
  needs_country: boolean;
  sort: number;
};
export async function listReminderTypes(): Promise<ReminderTypeCatalog[]> {
  const { data, error } = await supabase
    .from("reminder_types")
    .select("id, code, subject_kind, name_key, default_interval_months, needs_country, sort")
    .order("subject_kind", { ascending: true })
    .order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReminderTypeCatalog[];
}

// Generičan rok (za tip-vođen tok „Novi/Izmeni rok").
export type ReminderInput = {
  subjectType: ReminderSubjectType;
  subjectId: string;
  typeId: string | null;      // null = „prilagođen"
  category: string;           // tipovan: type.code; prilagođen: 'custom'
  label: string | null;
  mode: ReminderMode;
  dueDate: string | null;
  dueKm: number | null;
  issuedAt: string | null;
  countryCode: string | null;
};
export async function createReminder(input: ReminderInput): Promise<void> {
  const company_id = await currentCompanyId();
  const { error } = await supabase.from("reminders").insert({
    company_id, subject_type: input.subjectType, subject_id: input.subjectId, kind: "date",
    type_id: input.typeId, category: input.category, label: input.label,
    mode: input.mode, due_date: input.dueDate, due_km: input.dueKm,
    issued_at: input.issuedAt, country_code: input.countryCode,
  });
  if (error) throw error;
}
export async function updateReminder(id: string, input: ReminderInput): Promise<void> {
  const { error } = await supabase.from("reminders").update({
    type_id: input.typeId, category: input.category, label: input.label,
    mode: input.mode, due_date: input.dueDate, due_km: input.dueKm,
    issued_at: input.issuedAt, country_code: input.countryCode,
    notified_stage: null, // izmena roka -> opomene iznova
  }).eq("id", id);
  if (error) throw error;
}

// Ulaz za upsert singleton datumskog roka.
export type SetDateReminderInput = {
  dueDate: string | null;
  issuedAt?: string | null;
  label?: string | null;
};

// Nacrt custom stavke (bez UI ključa) — koristi saveCustomReminders.
export type CustomReminderInput = {
  existingId: string | null;
  label: string;
  dueDate: string | null;
  issuedAt: string | null;
};

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

const DATE_COLS = "id, category, label, due_date, issued_at";

// ── Singleton datumski rok po (subject, category) ──

// Postojeći rok za (subjekat, kategorija) ili null.
export async function getDateReminder(
  subjectType: ReminderSubjectType,
  subjectId: string,
  category: string,
): Promise<DateReminder | null> {
  const { data, error } = await supabase
    .from("reminders")
    .select(DATE_COLS)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("category", category)
    .eq("kind", "date")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DateReminder | null) ?? null;
}

// Upsert: dueDate unet -> kreiraj/ažuriraj; dueDate prazan -> obriši postojeći.
// (Rok BEZ datuma isticanja nema smisla; issued_at se čuva samo uz due_date.)
export async function setDateReminder(
  subjectType: ReminderSubjectType,
  subjectId: string,
  category: string,
  values: SetDateReminderInput,
): Promise<void> {
  const existing = await getDateReminder(subjectType, subjectId, category);
  const dueDate = values.dueDate;
  const issued_at = values.issuedAt ?? null;
  const label = values.label ?? null;

  if (dueDate == null) {
    if (existing) await deleteReminder(existing.id);
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from("reminders")
      .update({ due_date: dueDate, issued_at, label, notified_stage: null }) // nov datum -> opomene iznova
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const company_id = await currentCompanyId();
  const { error } = await supabase.from("reminders").insert({
    company_id,
    subject_type: subjectType,
    subject_id: subjectId,
    category,
    kind: "date",
    due_date: dueDate,
    issued_at,
    label,
  });
  if (error) throw error;
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw error;
}

// ── Custom rokovi ("Ostali rokovi") — više stavki po subjektu ──

export async function listCustomReminders(
  subjectType: ReminderSubjectType,
  subjectId: string,
): Promise<DateReminder[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select(DATE_COLS)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("category", "custom")
    .eq("kind", "date")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DateReminder[];
}

// Reconcile custom stavki jednog subjekta: obriši uklonjene, ubaci nove, ažuriraj izmenjene.
// Nepotpune stavke (bez naziva ili datuma) se preskaču. `subjectId` mora postojati
// (za nove subjekte pozvati posle create-a, sa id-em novog reda).
export async function saveCustomReminders(
  subjectType: ReminderSubjectType,
  subjectId: string,
  drafts: ReadonlyArray<CustomReminderInput>,
): Promise<void> {
  const existing = await listCustomReminders(subjectType, subjectId);
  const keptIds = new Set(
    drafts.map((d) => d.existingId).filter((x): x is string => x != null),
  );

  for (const e of existing) {
    if (!keptIds.has(e.id)) await deleteReminder(e.id);
  }

  for (const d of drafts) {
    const label = d.label.trim();
    if (!label || !d.dueDate) continue; // nepotpuno -> preskoči
    if (d.existingId) {
      const { error } = await supabase
        .from("reminders")
        .update({ label, due_date: d.dueDate, issued_at: d.issuedAt ?? null, notified_stage: null }) // nov datum -> opomene iznova
        .eq("id", d.existingId);
      if (error) throw error;
    } else {
      const company_id = await currentCompanyId();
      const { error } = await supabase.from("reminders").insert({
        company_id,
        subject_type: subjectType,
        subject_id: subjectId,
        category: "custom",
        kind: "date",
        label,
        due_date: d.dueDate,
        issued_at: d.issuedAt ?? null,
      });
      if (error) throw error;
    }
  }
}

// Svi datumski rokovi jednog subjekta (za punjenje forme pri izmeni).
export async function listSubjectReminders(
  subjectType: ReminderSubjectType,
  subjectId: string,
): Promise<DateReminder[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select(DATE_COLS)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("kind", "date");
  if (error) throw error;
  return (data ?? []) as DateReminder[];
}

// ── Ekran "Rokovi": svi rokovi firme (datum + km) + ime subjekta + km vozila ──
type RawReminderRow = DateReminder & {
  subject_type: ReminderSubjectType; subject_id: string;
  type_id: string | null; country_code: string | null; mode: ReminderMode; due_km: number | null;
  reminder_types: { name_key: string } | null;
};
export async function listAllReminders(): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select(`id, category, label, due_date, issued_at, subject_type, subject_id, type_id, country_code, mode, due_km, reminder_types(name_key)`)
    .eq("kind", "date");
  if (error) throw error;
  // Zadrži validne: datumski sa due_date, ili km sa due_km.
  const rows = ((data ?? []) as unknown as RawReminderRow[]).filter(
    (r) => (r.mode === "km" ? r.due_km != null : r.due_date != null),
  );

  // Imena subjekata + kilometraža vozila (polimorfno — nema FK join-a): povuci mape jednom.
  const [veh, tra, dri] = await Promise.all([
    supabase.from("vehicles").select("id, registration, current_odometer"),
    supabase.from("trailers").select("id, registration"),
    supabase.from("drivers").select("id, full_name"),
  ]);
  const names = new Map<string, string>();
  const odo = new Map<string, number | null>();
  (veh.data ?? []).forEach((v: { id: string; registration: string; current_odometer: number | null }) => {
    names.set(v.id, v.registration); odo.set(v.id, v.current_odometer);
  });
  (tra.data ?? []).forEach((t: { id: string; registration: string }) => names.set(t.id, t.registration));
  (dri.data ?? []).forEach((d: { id: string; full_name: string }) => names.set(d.id, d.full_name));

  return rows.map((r) => ({
    id: r.id, category: r.category, label: r.label, due_date: r.due_date, issued_at: r.issued_at,
    subject_type: r.subject_type, subject_id: r.subject_id, subject_name: names.get(r.subject_id) ?? "—",
    type_id: r.type_id, type_name_key: r.reminder_types?.name_key ?? null,
    country_code: r.country_code, mode: r.mode, due_km: r.due_km,
    subject_odometer: r.subject_type === "vehicle" ? odo.get(r.subject_id) ?? null : null,
  }));
}

// ── Kompatibilnost: lekarsko uverenje vozača (deleguje na generičke funkcije) ──
export type DriverMedicalReminder = { id: string; due_date: string | null };

export async function getDriverMedicalReminder(
  driverId: string,
): Promise<DriverMedicalReminder | null> {
  const r = await getDateReminder("driver", driverId, "medical");
  return r ? { id: r.id, due_date: r.due_date } : null;
}

export async function setDriverMedicalReminder(
  driverId: string,
  dueDate: string | null,
): Promise<void> {
  await setDateReminder("driver", driverId, "medical", { dueDate });
}
