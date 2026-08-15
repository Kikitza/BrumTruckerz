// Čista logika limita paketa (BEZ Supabase importa — testabilno).
// Autoritativni enforcement je u BAZI (trigger); ovo je za UI predproveru + prepoznavanje greške.

// Može li se dodati još vozila (count < limit).
export function canAddVehicle(count: number, limit: number): boolean {
  return count < limit;
}

// Prepoznaj grešku iz baznog trigger-a (raise 'VEHICLE_LIMIT_REACHED: …').
export function isVehicleLimitError(message: string | null | undefined): boolean {
  return !!message && message.includes("VEHICLE_LIMIT_REACHED");
}
