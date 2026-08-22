// Sesija + uloga. Gate po ulozi radi app/index.tsx.
//
// VAŽNO (bezbednost rutiranja): `loading` ostaje true dok se sesija NE utvrdi i,
// ako sesija postoji, dok se rola NE učita. Nikad ne puštamo gate da odluči sa
// polovičnim stanjem (to je pravilo van kojeg je nastao fail-open bug: dok rola
// nije poznata, app/index.tsx NE sme na owner ekrane).
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { ensureIdentity } from "../identity/api";

export type Role = "platform_admin" | "owner" | "dispatcher" | "driver";

// Globalni signal „ponovo pročitaj nalog" — koristi ga prekidač aktivne firme (ADR 0013),
// koji živi van gate stabla, da natera useSession da preračuna ulogu/firmu.
let appUserListeners: (() => void)[] = [];
export function reloadAppUser() {
  for (const fn of appUserListeners) fn();
}

export function useSession() {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false); // da li je sesija UTVRĐENA
  const [roleBump, setRoleBump] = useState(0);             // ručno ponovno čitanje uloge
  const prevUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setSessionReady(true);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!sessionReady) return; // čekaj da se sesija utvrdi (drži loading=true)
    const uid = session?.user.id ?? null;

    // Promena korisnika (login/logout/zamena naloga): očisti keš prethodnog korisnika,
    // da vozač ne vidi vlasnikove keširane podatke i obrnuto.
    if (prevUid.current !== undefined && prevUid.current !== uid) qc.clear();
    prevUid.current = uid;

    if (!uid) { setRole(null); setLoading(false); return; }

    let active = true;
    setLoading(true);
    // Uloga iz app_users (identitet). Ako reda NEMA (nov nalog bez firme) → bootstrap čistog
    // identiteta (ensure_identity, ADR 0013 dopuna / 0036), pa rola ostaje null (radnik bez firme).
    supabase.from("app_users").select("role").eq("id", uid).maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (!error && !data) {
          // Nema identiteta → napravi ga (idempotentno), da mrežni profil/pozivi mogu da rade.
          try { await ensureIdentity(); } catch { /* fail-closed: rola ostaje null */ }
          if (!active) return;
          setRole(null); setLoading(false);
          return;
        }
        // Fail-closed: greška ili nepoznata rola -> null (gate NE sme na owner).
        // role može biti null (identitet bez firme) → gate vodi na onboarding dom.
        setRole(!error && data ? ((data.role as Role | null) ?? null) : null);
        setLoading(false);
      });
    return () => { active = false; };
  }, [sessionReady, session?.user.id, qc, roleBump]);

  // Ponovo pročitaj ulogu bez odjave — posle prihvatanja pozivnice app_users red nastaje
  // / dobija company_id, pa gate treba da se preračuna (fail-closed ostaje: loading=true
  // dok se ne učita, nikad na owner ekrane sa polovičnim stanjem).
  const reloadRole = () => setRoleBump((b) => b + 1);

  // Pretplata na globalni signal (prebacivanje aktivne firme) — preračunaj ulogu/firmu.
  useEffect(() => {
    const fn = () => setRoleBump((b) => b + 1);
    appUserListeners.push(fn);
    return () => { appUserListeners = appUserListeners.filter((f) => f !== fn); };
  }, []);

  return { session, role, loading, reloadRole };
}
