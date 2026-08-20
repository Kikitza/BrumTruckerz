// Lagani hook za ulogu ulogovanog korisnika (za UI koje krije owner-only delove).
// Kešira se kroz React Query (invalidira se na promenu korisnika — qc.clear u useSession).
// Ne postavlja auth listenere (za razliku od useSession) → bezbedno u više ekrana.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Role } from "./useSession";

export function useRole() {
  const q = useQuery({
    queryKey: ["app-role"],
    queryFn: async (): Promise<Role | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) return null;
      const { data } = await supabase.from("app_users").select("role").eq("id", uid).maybeSingle();
      return (data?.role as Role) ?? null;
    },
  });
  const role = q.data ?? null;
  return { role, isOwner: role === "owner", isOffice: role === "owner" || role === "dispatcher" };
}
