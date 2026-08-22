// Čista logika filtera mreže (BEZ Supabase importa — testabilno jestom).
// Prazan string (ili samo razmaci) → null (RPC tretira null kao „bez filtera").
export type NetworkFilters = {
  role: string | null;
  country: string | null;
  language: string | null;
  availableOnly: boolean;
};

export type NetworkSearchParams = {
  p_role: string | null;
  p_country: string | null;
  p_language: string | null;
  p_available_only: boolean;
  p_limit: number;
  p_offset: number;
};

const clean = (s: string | null | undefined): string | null => {
  const v = (s ?? "").trim();
  return v.length ? v : null;
};

// Filteri iz UI → parametri RPC-a network_search. `page` (0-baziran) → offset.
export function buildSearchParams(f: NetworkFilters, page = 0, pageSize = 50): NetworkSearchParams {
  return {
    p_role: clean(f.role),
    p_country: clean(f.country),
    p_language: clean(f.language),
    p_available_only: !!f.availableOnly,
    p_limit: pageSize,
    p_offset: Math.max(0, page) * pageSize,
  };
}

// Sertifikati su SAMODEKLARISANI; u bazi jsonb (podrazumevano prazan objekat).
// Za prikaz/edit tretiramo ih kao listu stringova; sve što nije niz → prazna lista.
export function certList(certificates: unknown): string[] {
  return Array.isArray(certificates) ? certificates.filter((c): c is string => typeof c === "string") : [];
}
