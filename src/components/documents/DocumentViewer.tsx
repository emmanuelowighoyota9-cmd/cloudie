import { useRef } from "react";
import { snapdom } from "@zumer/snapdom";
import { Button } from "@/components/ui/button";
import { Download, Printer, ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

/* ─── helpers ─── */
function S(val: unknown): string {
  if (val == null) return "";
  return String(val);
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return iso; }
}
function fmtDateTime(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
function fmtCurrency(amount: unknown, currency = "USD") {
  const n = parseFloat(String(amount || "0"));
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}
function shortDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return iso; }
}
function dayOfWeek(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  } catch { return ""; }
}
function timeOnly(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return iso; }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FLIGHT ITINERARY — Modern airline e-ticket / boarding-pass inspired layout
   ═══════════════════════════════════════════════════════════════════════════════ */
function FlightDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  const dep = S(data.departure) || "—";
  const arr = S(data.arrival) || "—";
  const depCode = dep.substring(0, 3).toUpperCase();
  const arrCode = arr.substring(0, 3).toUpperCase();

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Branded Header Bar ── */}
      <div className="bg-[#0f766e] text-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 backdrop-blur rounded-lg flex items-center justify-center">
            <span className="text-white text-base font-extrabold">C</span>
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-tight leading-tight">CLOUDIE</p>
            <p className="text-[9px] uppercase tracking-[0.35em] text-white/60">Global Logistics & Travel</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-white/70">E-Ticket Itinerary</p>
          <p className="text-xs font-bold mt-0.5">{title}</p>
        </div>
      </div>

      {/* ── Routing Box ── */}
      <div className="mx-8 mt-6 border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-stretch">
          {/* Departure */}
          <div className="flex-1 px-6 py-5 bg-gray-50/80">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">From</p>
            <p className="text-2xl font-extrabold text-gray-900 leading-none">{depCode}</p>
            <p className="text-xs font-medium text-gray-600 mt-1">{dep}</p>
            {!!data.departureDate && (
              <div className="mt-2">
                <p className="text-[10px] text-gray-400">{dayOfWeek(S(data.departureDate))} {shortDate(S(data.departureDate))}</p>
                <p className="text-sm font-bold text-gray-900">{timeOnly(S(data.departureDate))}</p>
              </div>
            )}
          </div>

          {/* Center connector */}
          <div className="relative flex flex-col items-center justify-center px-4 bg-white">
            <div className="w-8 h-8 rounded-full bg-[#0f766e]/10 flex items-center justify-center mb-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
              </svg>
            </div>
            <div className="w-24 border-t border-dashed border-gray-300" />
            <p className="text-[10px] font-bold text-[#0f766e] mt-1">{S(data.flightNumber) || "—"}</p>
          </div>

          {/* Arrival */}
          <div className="flex-1 px-6 py-5 bg-gray-50/80 text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">To</p>
            <p className="text-2xl font-extrabold text-gray-900 leading-none">{arrCode}</p>
            <p className="text-xs font-medium text-gray-600 mt-1">{arr}</p>
            {!!data.arrivalDate && (
              <div className="mt-2">
                <p className="text-[10px] text-gray-400">{dayOfWeek(S(data.arrivalDate))} {shortDate(S(data.arrivalDate))}</p>
                <p className="text-sm font-bold text-gray-900">{timeOnly(S(data.arrivalDate))}</p>
              </div>
            )}
          </div>
        </div>

        {/* Dashed tear-line */}
        <div className="relative h-0">
          <div className="absolute left-0 right-0 border-t border-dashed border-gray-300" />
          <div className="absolute -left-3 -top-2 w-5 h-5 bg-white rounded-full" />
          <div className="absolute -right-3 -top-2 w-5 h-5 bg-white rounded-full" />
        </div>

        {/* Passenger & Booking Row */}
        <div className="grid grid-cols-4 divide-x divide-gray-200">
          <div className="px-4 py-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Passenger</p>
            <p className="text-xs font-bold text-gray-900 mt-0.5 truncate">{S(data.passengerName) || "—"}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Booking Ref</p>
            <p className="text-xs font-bold text-[#0f766e] mt-0.5 font-mono">{S(data.bookingRef) || "—"}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Seat</p>
            <p className="text-xs font-bold text-gray-900 mt-0.5">{S(data.seat) || "—"} · {S(data.cabin) || "Economy"}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Baggage</p>
            <p className="text-xs font-bold text-gray-900 mt-0.5">{data.baggage ? `${S(data.baggage)} bag(s)` : "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Flight Details Grid ── */}
      <div className="mx-8 mt-5 grid grid-cols-3 gap-4">
        {[
          { label: "Airline", value: S(data.airline) || "—" },
          { label: "Flight No.", value: S(data.flightNumber) || "—" },
          { label: "Cabin Class", value: S(data.cabin) || "Economy" },
        ].map((item) => (
          <div key={item.label} className="px-4 py-3 bg-[#f0faf9] rounded-lg border border-[#0f766e]/10">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">{item.label}</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      {/* ── Important Notice ── */}
      <div className="mx-8 mt-5 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Important Notice</p>
        <p className="text-[11px] leading-relaxed text-amber-800">
          This document is generated by Cloudie Global Logistics as an itinerary record. It is not a confirmed airline ticket.
          Please verify all details with the carrier directly before travel. Present this document at check-in along with valid identification.
        </p>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 flex items-center justify-between pt-4 border-t border-gray-200">
        <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(new Date().toISOString())}</p>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#0f766e]/10 rounded flex items-center justify-center">
            <span className="text-[#0f766e] text-[8px] font-bold">C</span>
          </div>
          <p className="text-[9px] text-gray-400">cloudie.com</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   HOTEL RESERVATION — Elegant property-branded confirmation
   ═══════════════════════════════════════════════════════════════════════════════ */
function HotelDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  const nights = data.checkIn && data.checkOut
    ? Math.max(1, Math.round((new Date(S(data.checkOut)).getTime() - new Date(S(data.checkIn)).getTime()) / 86400000))
    : 0;

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Elegant Header ── */}
      <div className="relative bg-gradient-to-r from-[#0f766e] to-[#115e59] text-white px-8 py-7">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-extrabold">C</span>
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight leading-tight">CLOUDIE</p>
              <p className="text-[9px] uppercase tracking-[0.35em] text-white/50">Hospitality & Travel</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/60">Reservation Confirmation</p>
            <p className="text-xs font-bold mt-0.5">{title}</p>
          </div>
        </div>
        {/* Decorative line */}
        <div className="absolute bottom-0 left-8 right-8 h-px bg-white/20" />
      </div>

      {/* ── Confirmation Number Badge ── */}
      <div className="mx-8 -mt-0 relative z-10">
        <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-5 py-3 shadow-sm mt-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400">Confirmation #</p>
          <p className="text-lg font-extrabold text-[#0f766e] font-mono tracking-wider">{S(data.confirmationNumber) || "PENDING"}</p>
        </div>
      </div>

      {/* ── Guest & Property ── */}
      <div className="mx-8 mt-5 grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Guest Name</p>
          <p className="text-sm font-bold text-gray-900">{S(data.guestName) || "—"}</p>
          <p className="text-[10px] text-gray-400 mt-1">{S(data.guests) || "1"} guest(s)</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Room Type</p>
          <p className="text-sm font-bold text-gray-900">{S(data.roomType) || "Standard"}</p>
        </div>
      </div>

      {/* ── Property Card ── */}
      <div className="mx-8 mt-4 p-5 bg-[#f0faf9] rounded-xl border border-[#0f766e]/10">
        <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0f766e]/60 mb-1">Property</p>
        <p className="text-xl font-extrabold text-gray-900">{S(data.hotel) || "—"}</p>
        {!!data.address && <p className="text-xs text-gray-500 mt-1">{S(data.address)}</p>}
      </div>

      {/* ── Check-in / Check-out Cards ── */}
      <div className="mx-8 mt-5 grid grid-cols-2 gap-4">
        <div className="relative p-5 bg-white border-2 border-[#0f766e] rounded-xl text-center overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#0f766e]" />
          <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-[#0f766e]/70 mb-1">Check-in</p>
          <p className="text-xl font-extrabold text-gray-900">{data.checkIn ? fmtDate(S(data.checkIn)) : "—"}</p>
          <p className="text-[10px] text-gray-400 mt-1">From 3:00 PM</p>
        </div>
        <div className="relative p-5 bg-white border-2 border-gray-200 rounded-xl text-center overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-300" />
          <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-1">Check-out</p>
          <p className="text-xl font-extrabold text-gray-900">{data.checkOut ? fmtDate(S(data.checkOut)) : "—"}</p>
          <p className="text-[10px] text-gray-400 mt-1">Before 11:00 AM</p>
        </div>
      </div>

      {/* ── Stay Summary ── */}
      <div className="mx-8 mt-5 flex items-center justify-center gap-6 py-4 bg-gray-50 rounded-lg border border-gray-100">
        <div className="text-center">
          <p className="text-2xl font-extrabold text-[#0f766e]">{nights || "—"}</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mt-0.5">Night{nights !== 1 ? "s" : ""}</p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          <p className="text-2xl font-extrabold text-gray-900">{S(data.guests) || "1"}</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mt-0.5">Guests</p>
        </div>
      </div>

      {/* ── Policies ── */}
      <div className="mx-8 mt-5 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">Booking Policies</p>
        <ul className="text-[11px] leading-relaxed text-blue-800 space-y-0.5">
          <li>• Check-in: 3:00 PM — Check-out: 11:00 AM</li>
          <li>• Valid photo ID required at check-in</li>
          <li>• Free cancellation up to 24 hours before check-in</li>
          <li>• This reservation is generated by Cloudie Global Logistics</li>
        </ul>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 flex items-center justify-between pt-4 border-t border-gray-200">
        <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(new Date().toISOString())}</p>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#0f766e]/10 rounded flex items-center justify-center">
            <span className="text-[#0f766e] text-[8px] font-bold">C</span>
          </div>
          <p className="text-[9px] text-gray-400">cloudie.com</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMMERCIAL INVOICE — Professional business document
   ═══════════════════════════════════════════════════════════════════════════════ */
function InvoiceDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const currency = S(data.currency) || "USD";
  const tax = parseFloat(S(data.tax) || "0");
  const shipping = parseFloat(S(data.shipping) || "0");
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity ?? 0)) * (Number(item.unitPrice ?? 0)), 0);
  const total = subtotal + tax + shipping;

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <div className="flex items-stretch">
        <div className="flex-1 bg-[#0f766e] text-white px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-extrabold">C</span>
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight leading-tight">CLOUDIE</p>
              <p className="text-[9px] uppercase tracking-[0.35em] text-white/50">Global Logistics</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 text-white px-8 py-6 flex flex-col justify-center items-end min-w-[200px]">
          <p className="text-[9px] uppercase tracking-[0.25em] text-white/50 font-semibold">Commercial Invoice</p>
          <p className="text-xl font-extrabold mt-1">{S(data.invoiceNumber) || "—"}</p>
          <p className="text-[10px] text-white/60 mt-1">{fmtDate(new Date().toISOString())}</p>
        </div>
      </div>

      {/* ── Seller / Buyer ── */}
      <div className="mx-8 mt-6 grid grid-cols-2 gap-5">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0f766e] mb-1.5">Sold By</p>
          <p className="text-sm font-bold text-gray-900">{S(data.seller) || "—"}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0f766e] mb-1.5">Sold To</p>
          <p className="text-sm font-bold text-gray-900">{S(data.buyer) || "—"}</p>
        </div>
      </div>

      {/* ── Line Items Table ── */}
      <div className="mx-8 mt-5">
        <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr className="bg-[#0f766e]">
              <th className="text-left px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white rounded-tl-lg">Description</th>
              <th className="text-center px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white w-16">Qty</th>
              <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white w-28">Unit Price</th>
              <th className="text-right px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white w-28 rounded-tr-lg">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-4 py-2.5 text-xs font-medium border-b border-gray-100">{S(item.description) || "—"}</td>
                <td className="text-center px-3 py-2.5 text-xs border-b border-gray-100">{String(item.quantity ?? "")}</td>
                <td className="text-right px-3 py-2.5 text-xs border-b border-gray-100">{fmtCurrency(item.unitPrice, currency)}</td>
                <td className="text-right px-4 py-2.5 text-xs font-bold border-b border-gray-100">{fmtCurrency((Number(item.quantity ?? 0)) * (Number(item.unitPrice ?? 0)), currency)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-gray-400 text-xs border-b border-gray-100">No line items</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Totals ── */}
      <div className="mx-8 mt-4 flex justify-end">
        <div className="w-72">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">{fmtCurrency(subtotal, currency)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between px-3 py-1.5 bg-gray-50 rounded">
                <span className="text-gray-500">Tax</span>
                <span className="font-medium">{fmtCurrency(tax, currency)}</span>
              </div>
            )}
            {shipping > 0 && (
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-gray-500">Shipping & Handling</span>
                <span className="font-medium">{fmtCurrency(shipping, currency)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-between items-center bg-[#0f766e] text-white px-4 py-3 rounded-lg">
            <span className="text-xs font-bold uppercase tracking-wider">Total Due</span>
            <span className="text-lg font-extrabold">{fmtCurrency(total, currency)}</span>
          </div>
        </div>
      </div>

      {/* ── Payment Terms ── */}
      <div className="mx-8 mt-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Payment Terms</p>
        <p className="text-[11px] leading-relaxed text-gray-600">
          Payment is due within 30 days of invoice date. All amounts are in {currency}. Late payments may incur a 1.5% monthly finance charge.
        </p>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(new Date().toISOString())}</p>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#0f766e]/10 rounded flex items-center justify-center">
              <span className="text-[#0f766e] text-[8px] font-bold">C</span>
            </div>
            <p className="text-[9px] text-gray-400">cloudie.com</p>
          </div>
        </div>
        <p className="text-[9px] text-gray-400 mt-2 text-center">This invoice is generated by Cloudie Global Logistics. Retain for your records.</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CUSTOMS DECLARATION — Official government-form inspired layout
   ═══════════════════════════════════════════════════════════════════════════════ */
function CustomsDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Official Header ── */}
      <div className="bg-gray-900 text-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-extrabold">C</span>
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight leading-tight">CLOUDIE</p>
              <p className="text-[9px] uppercase tracking-[0.35em] text-white/50">International Shipping</p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block px-3 py-1 bg-white/10 rounded text-[9px] font-bold uppercase tracking-[0.2em] text-white/80">
              Customs Declaration
            </div>
            <p className="text-[10px] text-white/50 mt-2">{title}</p>
          </div>
        </div>
      </div>

      {/* ── Yellow declaration bar ── */}
      <div className="mx-8 mt-5 px-4 py-2.5 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
          ⚠ Official Customs Declaration — All information must be accurate
        </p>
      </div>

      {/* ── Shipper / Consignee ── */}
      <div className="mx-8 mt-5 grid grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-[#0f766e] text-white px-4 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Shipper / Exporter</p>
          </div>
          <div className="p-4">
            <p className="text-sm font-bold text-gray-900">{S(data.senderName) || "—"}</p>
            <p className="text-xs text-gray-500 mt-1">{S(data.senderCountry) || "—"}</p>
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-[#0f766e] text-white px-4 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Consignee / Importer</p>
          </div>
          <div className="p-4">
            <p className="text-sm font-bold text-gray-900">{S(data.receiverName) || "—"}</p>
            <p className="text-xs text-gray-500 mt-1">{S(data.receiverCountry) || "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Package Information ── */}
      <div className="mx-8 mt-5 border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-600">Package Information</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="p-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Description</p>
            <p className="text-xs font-bold text-gray-900 mt-1">{S(data.packageDescription) || "—"}</p>
          </div>
          <div className="p-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Commodity / HS Code</p>
            <p className="text-xs font-bold text-gray-900 mt-1">{S(data.commodity) || "—"}</p>
          </div>
          <div className="p-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Country of Origin</p>
            <p className="text-xs font-bold text-gray-900 mt-1">{S(data.countryOfOrigin) || "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Value & Weight ── */}
      <div className="mx-8 mt-4 grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Declared Value</p>
          <p className="text-xl font-extrabold text-[#0f766e] mt-1">{data.value ? fmtCurrency(data.value) : "—"}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Gross Weight</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{data.weight ? `${S(data.weight)} kg` : "—"}</p>
        </div>
      </div>

      {/* ── Declaration ── */}
      <div className="mx-8 mt-5 border-2 border-gray-900 rounded-lg overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Declaration</p>
        </div>
        <div className="p-4">
          <p className="text-[11px] leading-relaxed text-gray-700">
            I hereby declare that the information provided in this customs declaration is true and correct.
            The contents of this package are accurately described and the declared values represent the true
            commercial value of the goods. I understand that making a false or fraudulent declaration is a
            criminal offense.
          </p>
          {!!data.declarationInfo && (
            <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">Additional Information</p>
              <p className="text-xs text-gray-700">{S(data.declarationInfo)}</p>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="border-b border-gray-300 pb-1">
              <p className="text-[9px] text-gray-400">Authorized Signature</p>
            </div>
            <div className="border-b border-gray-300 pb-1">
              <p className="text-[9px] text-gray-400">Date: {fmtDate(new Date().toISOString())}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 pt-4 border-t border-gray-200 flex items-center justify-between">
        <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(new Date().toISOString())}</p>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#0f766e]/10 rounded flex items-center justify-center">
            <span className="text-[#0f766e] text-[8px] font-bold">C</span>
          </div>
          <p className="text-[9px] text-gray-400">cloudie.com</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN VIEWER
   ═══════════════════════════════════════════════════════════════════════════════ */
export type DocumentType = "flight" | "hotel" | "invoice" | "customs";

const TYPE_LABELS: Record<DocumentType, string> = {
  flight: "Flight Itinerary",
  hotel: "Hotel Reservation",
  invoice: "Commercial Invoice",
  customs: "Customs Declaration",
};

export function DocumentViewer({
  document: doc,
  onBack,
}: {
  document: {
    _id: string;
    type: string;
    title: string;
    data: Record<string, unknown>;
    pointsCost: number;
    createdAt: number;
  };
  onBack?: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const docType = doc.type as DocumentType;

  const print = () => window.print();

  const download = async () => {
    if (!contentRef.current) return;
    try {
      const canvas = await snapdom.toCanvas(contentRef.current, { scale: 2 });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.type}-${doc.title.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      a.click();
      toast.success("Document downloaded");
    } catch {
      toast.error("Could not render document for download");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">{doc.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{TYPE_LABELS[docType] || doc.type}</Badge>
            <span className="text-xs text-muted-foreground">{doc.pointsCost} pts · {fmtDate(new Date(doc.createdAt).toISOString())}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={print}>
          <Printer className="h-4 w-4 mr-1.5" /> Print
        </Button>
        <Button size="sm" onClick={download}>
          <Download className="h-4 w-4 mr-1.5" /> Download
        </Button>
      </div>

      {/* Document preview */}
      <div className="rounded-xl border border-border overflow-hidden shadow-lg shadow-black/5">
        <div ref={contentRef}>
          {docType === "flight" && <FlightDocumentLayout data={doc.data} title={doc.title} />}
          {docType === "hotel" && <HotelDocumentLayout data={doc.data} title={doc.title} />}
          {docType === "invoice" && <InvoiceDocumentLayout data={doc.data} title={doc.title} />}
          {docType === "customs" && <CustomsDocumentLayout data={doc.data} title={doc.title} />}
          {![ "flight", "hotel", "invoice", "customs"].includes(docType) && (
            <div className="p-12 text-center text-gray-400">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No preview available for this document type.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
