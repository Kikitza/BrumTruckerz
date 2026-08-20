// Čista logika fakture (BEZ Supabase — testabilno). Autoritativni obračun i numeracija su u
// BAZI (issue_invoice/next_invoice_no, 0023); ovo je za PRIKAZ/predlog u klijentu i mora da se
// poklapa. Matematiku računa KOD (pravilo #5) — round na 2 decimale.

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export type InvoiceAmounts = { amount: number; vatAmount: number; total: number };

// Osnova + PDV + ukupno (round2). vatRate je procenat (npr. 20 = 20%).
export function computeInvoiceAmounts(amount: number, vatRate: number): InvoiceAmounts {
  const base = round2(amount);
  const vatAmount = round2(base * (vatRate || 0) / 100);
  const total = round2(base + vatAmount);
  return { amount: base, vatAmount, total };
}

// Format broja fakture — ogledalo SQL-a: <prefix><GODINA>-<NNN> (min 3 cifre).
export function formatInvoiceNo(prefix: string, year: number, n: number): string {
  return `${prefix ?? ""}${year}-${String(n).padStart(3, "0")}`;
}

// Predlog roka plaćanja = izdavanje + rok naručioca (dana). Ulaz/izlaz 'YYYY-MM-DD'.
export function proposeDueDate(issueDate: string, paymentTermsDays: number): string {
  const d = new Date(`${issueDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (paymentTermsDays || 0));
  return d.toISOString().slice(0, 10);
}

export type InvoiceStatus = "issued" | "paid" | "cancelled";
export type InvoiceDisplayStatus = InvoiceStatus | "overdue";

// „KASNI" nije kolona — computed: izdata i rok prošao. Plaćena/stornirana ostaju kakve jesu.
export function invoiceDisplayStatus(
  status: InvoiceStatus, dueDate: string | null, today: string,
): InvoiceDisplayStatus {
  if (status === "issued" && dueDate && dueDate < today) return "overdue";
  return status;
}
