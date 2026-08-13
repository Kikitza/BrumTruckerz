// Sesija + uloga. Gate po ulozi radi app/index.tsx.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export type Role = "platform_admin" | "owner" | "driver";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setRole(null); setLoading(false); return; }
    // Uloga se čita iz app_users (profil). Red mora prethodno postojati —
    // bootstrap-uje se service-role/ručno; nema klijentskog toka registracije.
    // TODO (kasnija faza): owner kreira app_users red za vozača (bez firme dok ga
    // ne veže) i povezuje drivers.user_id; sistem pozivnica se NE gradi sada.
    supabase.from("app_users").select("role").eq("id", session.user.id).single()
      .then(({ data }) => { setRole((data?.role as Role) ?? null); setLoading(false); });
  }, [session?.user.id]);

  return { session, role, loading };
}
