// Troškovi — multivaluta (pravilo #4): vozač unosi original sa računa;
// kurs i base_amount rešava offline handler pri sinhronizaciji.
import { enqueue } from "../../lib/offline/queue";

export async function addExpense(p: {
  company_id: string; trip_id: string; category: string;
  original_amount: number; original_currency: string;   // ono što piše na računu
  base_currency: string;                                 // bazna valuta firme
  occurred_at?: string; liters?: number; country?: string; note?: string;
  fx_rate?: number;                                      // ručna korekcija kursa (opciono)
}) {
  await enqueue("expense.insert", { occurred_at: new Date().toISOString(), ...p });
}
