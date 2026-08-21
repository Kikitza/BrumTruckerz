// PDF fakture: HTML šablon → expo-print → upload u 'prilozi' bucket → expo-sharing „Podeli".
// Jezik fakture: SR ili EN (izbor pri izdavanju; default sr). Ostali jezici KASNIJE — faktura je
// pravni dokument, pa idu samo autorski prevodi (v. IZVEŠTAJ), ne mašinski.
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";
import { base64ToBytes } from "../../lib/base64";
import { currentCompanyId } from "../auth/currentUser";
import { BRAND_NAME, BRAND_TAGLINE } from "../../lib/brand";
import { BRAND_MARK_DATA_URI } from "./brandMark";
import { getInvoice, getInvoiceSettings, setInvoicePdfKey, type InvoiceFull, type InvoiceSettings } from "./api";

export type InvoiceLang = "sr" | "en";

type Labels = {
  invoice: string; issuer: string; buyer: string; no: string; issueDate: string; dueDate: string;
  desc: string; date: string; base: string; vat: string; total: string; bank: string; taxId: string;
  regNo: string; service: (o: string, d: string) => string; paid: string; cancelled: string;
};

const LABELS: Record<InvoiceLang, Labels> = {
  sr: {
    invoice: "FAKTURA", issuer: "Izdavalac", buyer: "Kupac / Primalac", no: "Broj",
    issueDate: "Datum izdavanja", dueDate: "Rok plaćanja", desc: "Opis", date: "Datum",
    base: "Osnovica", vat: "PDV", total: "UKUPNO", bank: "Tekući račun", taxId: "PIB", regNo: "Matični broj",
    service: (o, d) => `Usluga prevoza: ${o} → ${d}`, paid: "PLAĆENO", cancelled: "STORNIRANO",
  },
  en: {
    invoice: "INVOICE", issuer: "Issuer", buyer: "Bill to", no: "No.",
    issueDate: "Issue date", dueDate: "Due date", desc: "Description", date: "Date",
    base: "Net", vat: "VAT", total: "TOTAL", bank: "Bank account", taxId: "VAT ID", regNo: "Reg. no.",
    service: (o, d) => `Transport service: ${o} → ${d}`, paid: "PAID", cancelled: "CANCELLED",
  },
};

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number | null, cur: string) => `${(n ?? 0).toFixed(2)} ${esc(cur)}`;

export function buildInvoiceHtml(inv: InvoiceFull, settings: InvoiceSettings | null, lang: InvoiceLang): string {
  const L = LABELS[lang];
  const origin = inv.trip?.origin ?? "—";
  const dest = inv.trip?.destination ?? "—";
  const svc = inv.trip ? L.service(origin, dest) : L.desc;
  const svcDate = inv.trip?.started_at ? esc(inv.trip.started_at.slice(0, 10)) : esc(inv.issue_date);
  const watermark = inv.status === "paid" ? L.paid : inv.status === "cancelled" ? L.cancelled : "";
  const issuerLines = [
    settings?.legal_name, settings?.address,
    settings?.tax_id ? `${L.taxId}: ${settings.tax_id}` : null,
    settings?.reg_no ? `${L.regNo}: ${settings.reg_no}` : null,
  ].filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join("");
  const buyerLines = [
    inv.customer?.name, inv.customer?.address,
    inv.customer?.vat_number ? `${L.taxId}: ${esc(inv.customer.country_code ?? "")}${esc(inv.customer.vat_number)}` : null,
  ].filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #14181f; padding: 28px; font-size: 13px; }
    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .brandmark { display: block; width: 54px; height: 54px; }
    .brandname { font-size: 30px; font-weight: 800; letter-spacing: 2px; color: #14181f; }
    .brandtag { font-size: 11px; color: #667; letter-spacing: 0.5px; margin-top: 2px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; }
    .no { font-size: 26px; font-weight: 800; letter-spacing: 1px; }
    .muted { color: #667; }
    .box { border: 1px solid #dde; border-radius: 8px; padding: 12px; }
    .cols { display: flex; gap: 16px; margin-top: 16px; }
    .cols > div { flex: 1; }
    h3 { font-size: 11px; text-transform: uppercase; color: #667; margin: 0 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eef; }
    td.r, th.r { text-align: right; }
    .totals { margin-top: 12px; margin-left: auto; width: 55%; }
    .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { font-weight: 800; font-size: 16px; border-top: 2px solid #14181f; margin-top: 4px; padding-top: 8px; }
    .foot { margin-top: 22px; color: #445; }
    .wm { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font-size: 60px; color: rgba(200,60,60,0.14); font-weight: 800; letter-spacing: 6px; }
  </style></head><body>
    ${watermark ? `<div class="wm">${esc(watermark)}</div>` : ""}
    <div class="brand"><img class="brandmark" src="${BRAND_MARK_DATA_URI}" alt="ETNOP"/><div><div class="brandname">${esc(BRAND_NAME)}</div><div class="brandtag">${esc(BRAND_TAGLINE)}</div></div></div>
    <div class="top">
      <div><div class="muted">${L.invoice}</div><div class="no">${esc(inv.invoice_no)}</div></div>
      <div class="muted" style="text-align:right">
        <div>${L.issueDate}: ${esc(inv.issue_date)}</div>
        ${inv.due_date ? `<div>${L.dueDate}: ${esc(inv.due_date)}</div>` : ""}
      </div>
    </div>
    <div class="cols">
      <div class="box"><h3>${L.issuer}</h3>${issuerLines || '<div class="muted">—</div>'}</div>
      <div class="box"><h3>${L.buyer}</h3>${buyerLines || '<div class="muted">—</div>'}</div>
    </div>
    <table>
      <tr><th>${L.desc}</th><th>${L.date}</th><th class="r">${L.base}</th><th class="r">${L.vat} (${esc(inv.vat_rate)}%)</th><th class="r">${L.total}</th></tr>
      <tr>
        <td>${esc(svc)}</td><td>${svcDate}</td>
        <td class="r">${money(inv.amount, inv.currency)}</td>
        <td class="r">${money(inv.vat_amount, inv.currency)}</td>
        <td class="r">${money(inv.total, inv.currency)}</td>
      </tr>
    </table>
    <div class="totals">
      <div class="row"><span>${L.base}</span><span>${money(inv.amount, inv.currency)}</span></div>
      <div class="row"><span>${L.vat} (${esc(inv.vat_rate)}%)</span><span>${money(inv.vat_amount, inv.currency)}</span></div>
      <div class="row grand"><span>${L.total}</span><span>${money(inv.total, inv.currency)}</span></div>
    </div>
    <div class="foot">
      ${settings?.bank_account ? `<div>${L.bank}: ${esc(settings.bank_account)}</div>` : ""}
      ${inv.vat_note ? `<div class="muted" style="margin-top:6px">${esc(inv.vat_note)}</div>` : ""}
      ${inv.note ? `<div class="muted" style="margin-top:6px">${esc(inv.note)}</div>` : ""}
    </div>
  </body></html>`;
}

// Generiši PDF, upload u 'prilozi' pod company_id/invoices/<invoice_id>.pdf (deterministički → bez siročadi),
// upiši pdf_storage_key. Vrati lokalni uri (za deljenje).
export async function generateInvoicePdf(invoiceId: string, lang: InvoiceLang): Promise<string> {
  const [inv, settings, company_id] = await Promise.all([getInvoice(invoiceId), getInvoiceSettings(), currentCompanyId()]);
  const html = buildInvoiceHtml(inv, settings, lang);
  const { uri } = await Print.printToFileAsync({ html });

  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const bytes = base64ToBytes(b64);
  const storage_key = `${company_id}/invoices/${invoiceId}.pdf`;
  const { error } = await supabase.storage.from("prilozi").upload(storage_key, bytes, {
    contentType: "application/pdf", upsert: true,
  });
  if (error) throw error;
  await setInvoicePdfKey(invoiceId, storage_key);
  return uri;
}

// „Podeli PDF": (re)generiši i podeli lokalni fajl (uvek aktuelan). Ako deljenje nije dostupno — tiho preskoči.
export async function shareInvoicePdf(invoiceId: string, lang: InvoiceLang): Promise<void> {
  const uri = await generateInvoicePdf(invoiceId, lang);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  }
}

// WEB (F3): „Štampaj / Sačuvaj PDF" — otvara browser print dijalog sa ISTIM HTML šablonom fakture
// (identičan izgled kao mobilni PDF; knjigovođa iz „Sačuvaj kao PDF" dobija PDF fajl). Bez uploada:
// pravi PDF bajtovi na webu tražili bi tešku zavisnost (jsPDF/pdf-lib) — arhiva (upload) ostaje mobilna (v1).
export async function printInvoiceWeb(invoiceId: string, lang: InvoiceLang): Promise<void> {
  const [inv, settings] = await Promise.all([getInvoice(invoiceId), getInvoiceSettings()]);
  await Print.printAsync({ html: buildInvoiceHtml(inv, settings, lang) });
}
