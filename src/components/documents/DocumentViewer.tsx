import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, Printer, ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { renderPdf, type PdfBlock } from "@/lib/pdf";

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
function pseudoBarcode(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  const bars: string[] = [];
  for (let i = 0; i < 48; i++) {
    hash = ((hash * 1103515245 + 12345) & 0x7fffffff);
    bars.push(hash % 3 === 0 ? "thin" : hash % 3 === 1 ? "thick" : "gap");
  }
  return bars.join(" ");
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FLIGHT ITINERARY — Full airline e-ticket / boarding pass inspired layout
   ═══════════════════════════════════════════════════════════════════════════════ */
function FlightDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  const dep = S(data.departure) || "—";
  const arr = S(data.arrival) || "—";
  const depCode = dep.substring(0, 3).toUpperCase();
  const arrCode = arr.substring(0, 3).toUpperCase();
  const ref = S(data.bookingRef) || "CLD" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const seqNo = String(Math.floor(Math.random() * 900) + 100);

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Branded Header Bar ── */}
      <div className="relative bg-[#0c4a6e] text-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center border border-white/20">
            <span className="text-white text-lg font-black tracking-tighter">CA</span>
          </div>
          <div>
            <p className="text-lg font-black tracking-tight leading-tight">CLOUDIE AIR</p>
            <p className="text-[8px] uppercase tracking-[0.4em] text-white/50">Global Aviation Services</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/60">Electronic Ticket Itinerary</p>
          <p className="text-xs font-bold mt-0.5">PNR: {ref}</p>
          <p className="text-[9px] text-white/50 mt-0.5">Issued: {dateStr}</p>
        </div>
      </div>

      {/* ── Routing Box ── */}
      <div className="mx-8 mt-6 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-stretch">
          {/* Departure */}
          <div className="flex-1 px-6 py-5 bg-gradient-to-b from-gray-50 to-white">
            <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-1">Departure</p>
            <p className="text-3xl font-black text-gray-900 leading-none tracking-tight">{depCode}</p>
            <p className="text-[11px] font-medium text-gray-500 mt-1">{dep}</p>
            {!!data.departureDate && (
              <div className="mt-3 space-y-0.5">
                <p className="text-[10px] font-semibold text-gray-400">{dayOfWeek(S(data.departureDate))} {shortDate(S(data.departureDate))}</p>
                <p className="text-lg font-black text-gray-900">{timeOnly(S(data.departureDate))}</p>
              </div>
            )}
          </div>

          {/* Center connector */}
          <div className="relative flex flex-col items-center justify-center px-5 bg-white">
            <div className="w-10 h-10 rounded-full bg-[#0c4a6e]/10 flex items-center justify-center mb-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0c4a6e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
              </svg>
            </div>
            <div className="w-28 border-t-2 border-dashed border-gray-300" />
            <div className="mt-2 px-3 py-1 bg-[#0c4a6e] rounded-md">
              <p className="text-[10px] font-black text-white tracking-wider">{S(data.flightNumber) || "—"}</p>
            </div>
          </div>

          {/* Arrival */}
          <div className="flex-1 px-6 py-5 bg-gradient-to-b from-gray-50 to-white text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-1">Arrival</p>
            <p className="text-3xl font-black text-gray-900 leading-none tracking-tight">{arrCode}</p>
            <p className="text-[11px] font-medium text-gray-500 mt-1">{arr}</p>
            {!!data.arrivalDate && (
              <div className="mt-3 space-y-0.5">
                <p className="text-[10px] font-semibold text-gray-400">{dayOfWeek(S(data.arrivalDate))} {shortDate(S(data.arrivalDate))}</p>
                <p className="text-lg font-black text-gray-900">{timeOnly(S(data.arrivalDate))}</p>
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
        <div className="grid grid-cols-5 divide-x divide-gray-200">
          <div className="px-4 py-3">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Passenger</p>
            <p className="text-[11px] font-bold text-gray-900 mt-0.5 truncate">{S(data.passengerName) || "—"}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Booking Ref</p>
            <p className="text-[11px] font-black text-[#0c4a6e] mt-0.5 font-mono tracking-wider">{ref}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Seat / Class</p>
            <p className="text-[11px] font-bold text-gray-900 mt-0.5">{S(data.seat) || "—"} · {S(data.cabin) || "Economy"}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Baggage</p>
            <p className="text-[11px] font-bold text-gray-900 mt-0.5">{data.baggage ? `${S(data.baggage)} PC` : "1 PC"}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Sequence</p>
            <p className="text-[11px] font-bold text-gray-900 mt-0.5 font-mono">{seqNo}</p>
          </div>
        </div>
      </div>

      {/* ── Flight Details Grid ── */}
      <div className="mx-8 mt-5 grid grid-cols-4 gap-3">
        {[
          { label: "Airline", value: S(data.airline) || "Cloudie Air" },
          { label: "Flight No.", value: S(data.flightNumber) || "—" },
          { label: "Cabin", value: S(data.cabin) || "Economy" },
          { label: "Aircraft", value: "Boeing 737-800" },
        ].map((item) => (
          <div key={item.label} className="px-3 py-2.5 bg-[#f0f9ff] rounded-lg border border-[#0c4a6e]/10">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">{item.label}</p>
            <p className="text-[11px] font-bold text-gray-900 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      {/* ── Baggage & Check-in Info ── */}
      <div className="mx-8 mt-4 grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-2">Baggage Allowance</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">Carry-on</span>
              <span className="font-semibold text-gray-900">1 × 7 kg</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">Checked</span>
              <span className="font-semibold text-gray-900">{data.baggage ? `${S(data.baggage)} × 23 kg` : "1 × 23 kg"}</span>
            </div>
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-2">Check-in Information</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">Online check-in</span>
              <span className="font-semibold text-gray-900">24h before departure</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">Counter closes</span>
              <span className="font-semibold text-gray-900">60 min before</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Barcode Strip ── */}
      <div className="mx-8 mt-5 p-4 bg-gray-900 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/50">Document Reference</p>
            <p className="text-sm font-mono font-bold text-white tracking-wider mt-0.5">{ref}</p>
          </div>
          <div className="flex gap-[1px] items-end h-10 mx-4">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="bg-white"
                style={{
                  width: i % 5 === 0 ? 2 : 1,
                  height: 20 + (i * 7 + 3) % 20,
                  opacity: 0.6 + (i % 3) * 0.15,
                }}
              />
            ))}
          </div>
          <div className="text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/50">Seq</p>
            <p className="text-lg font-black text-white font-mono">{seqNo}</p>
          </div>
        </div>
      </div>

      {/* ── Important Notices ── */}
      <div className="mx-8 mt-5 space-y-3">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mb-1">Important Notice</p>
          <p className="text-[10px] leading-relaxed text-amber-800">
            This itinerary is generated by Cloudie Air as a travel record. It is not a confirmed airline ticket.
            Please verify all details with the carrier before travel. Present this document at check-in with valid photo ID.
            Seat assignments are subject to change.
          </p>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-[9px] font-bold uppercase tracking-wider text-blue-700 mb-1">Fare Rules</p>
          <p className="text-[10px] leading-relaxed text-blue-800">
            Changes and cancellations may incur fees per carrier policy. Name corrections are not permitted after issuance.
            Refund eligibility depends on fare class. Contact the airline for rebooking options.
          </p>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(now.toISOString())}</p>
            <p className="text-[8px] text-gray-300 mt-0.5">Document ID: {ref}-{seqNo}-{now.getFullYear()}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[8px] text-gray-400">cloudie.com/air</p>
              <p className="text-[7px] text-gray-300">ICAO: CLD · IATA: C8</p>
            </div>
            <div className="w-8 h-8 bg-[#0c4a6e]/10 rounded-lg flex items-center justify-center">
              <span className="text-[#0c4a6e] text-[10px] font-black">CA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   HOTEL RESERVATION — Elegant luxury property confirmation
   ═══════════════════════════════════════════════════════════════════════════════ */
function HotelDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  const nights = data.checkIn && data.checkOut
    ? Math.max(1, Math.round((new Date(S(data.checkOut)).getTime() - new Date(S(data.checkIn)).getTime()) / 86400000))
    : 0;
  const confNum = S(data.confirmationNumber) || "HTL" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date();

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Elegant Header ── */}
      <div className="relative bg-gradient-to-r from-[#0c4a6e] via-[#075985] to-[#0c4a6e] text-white px-8 py-7">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center border border-white/20">
              <span className="text-white text-lg font-black tracking-tighter">CH</span>
            </div>
            <div>
              <p className="text-lg font-black tracking-tight leading-tight">CLOUDIE HOSPITALITY</p>
              <p className="text-[8px] uppercase tracking-[0.4em] text-white/50">Luxury Accommodations Worldwide</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-white/60">Reservation Confirmation</p>
            <p className="text-xs font-bold mt-0.5">{title}</p>
            <p className="text-[9px] text-white/50 mt-0.5">Issued: {fmtDate(now.toISOString())}</p>
          </div>
        </div>
        <div className="absolute bottom-0 left-8 right-8 h-px bg-white/20" />
      </div>

      {/* ── Confirmation Number Badge ── */}
      <div className="mx-8 relative z-10">
        <div className="inline-flex items-center gap-4 bg-white border-2 border-[#0c4a6e]/20 rounded-xl px-6 py-3 shadow-md mt-5">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Confirmation Number</p>
            <p className="text-2xl font-black text-[#0c4a6e] font-mono tracking-wider">{confNum}</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Status</p>
            <div className="mt-0.5 inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-50 border border-green-200 rounded-full">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <p className="text-[10px] font-bold text-green-700 uppercase">Confirmed</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Property Card ── */}
      <div className="mx-8 mt-5 p-6 bg-gradient-to-r from-[#f0f9ff] to-white rounded-xl border border-[#0c4a6e]/10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0c4a6e]/60 mb-1">Accommodation</p>
            <p className="text-2xl font-black text-gray-900">{S(data.hotel) || "—"}</p>
            {!!data.address && <p className="text-xs text-gray-500 mt-1.5">{S(data.address)}</p>}
          </div>
          <div className="text-right">
            <div className="inline-flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <svg key={s} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Guest & Room ── */}
      <div className="mx-8 mt-4 grid grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Guest Name</p>
          <p className="text-sm font-bold text-gray-900">{S(data.guestName) || "—"}</p>
          <p className="text-[10px] text-gray-400 mt-1">{S(data.guests) || "1"} guest(s)</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Room Type</p>
          <p className="text-sm font-bold text-gray-900">{S(data.roomType) || "Standard"}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Nights</p>
          <p className="text-sm font-bold text-gray-900">{nights || "—"} night{nights !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* ── Check-in / Check-out Cards ── */}
      <div className="mx-8 mt-5 grid grid-cols-2 gap-4">
        <div className="relative p-5 bg-white border-2 border-[#0c4a6e] rounded-xl text-center overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#0c4a6e]" />
          <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-[#0c4a6e]/70 mb-1">Check-in</p>
          <p className="text-xl font-black text-gray-900">{data.checkIn ? fmtDate(S(data.checkIn)) : "—"}</p>
          <p className="text-[10px] text-gray-400 mt-1">From 3:00 PM · Front desk</p>
        </div>
        <div className="relative p-5 bg-white border-2 border-gray-200 rounded-xl text-center overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-300" />
          <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-1">Check-out</p>
          <p className="text-xl font-black text-gray-900">{data.checkOut ? fmtDate(S(data.checkOut)) : "—"}</p>
          <p className="text-[10px] text-gray-400 mt-1">Before 11:00 AM · Front desk</p>
        </div>
      </div>

      {/* ── Amenities ── */}
      <div className="mx-8 mt-5 p-4 bg-gray-50 rounded-lg border border-gray-100">
        <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">Included Amenities</p>
        <div className="grid grid-cols-4 gap-2">
          {["Free Wi-Fi", "Breakfast", "Parking", "Pool", "Gym", "Spa Access", "Airport Shuttle", "Concierge"].map((a) => (
            <div key={a} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-md border border-gray-100">
              <svg className="w-3 h-3 text-[#0c4a6e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[9px] font-medium text-gray-700">{a}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Policies ── */}
      <div className="mx-8 mt-5 space-y-3">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-[9px] font-bold uppercase tracking-wider text-blue-700 mb-1.5">Booking Policies</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] leading-relaxed text-blue-800">
            <p>• Check-in: 3:00 PM — Check-out: 11:00 AM</p>
            <p>• Valid photo ID required at check-in</p>
            <p>• Free cancellation up to 24h before check-in</p>
            <p>• Late check-out subject to availability</p>
            <p>• No smoking in rooms — designated areas available</p>
            <p>• Pet policy: inquire at front desk</p>
          </div>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mb-1">Payment Summary</p>
          <div className="space-y-1 text-[10px] text-amber-800">
            <div className="flex justify-between">
              <span>Total stays: {nights} night{nights !== 1 ? "s" : ""} × {S(data.guests) || "1"} guest(s)</span>
              <span className="font-bold">Payable at property</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(now.toISOString())}</p>
            <p className="text-[8px] text-gray-300 mt-0.5">Confirmation: {confNum}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[8px] text-gray-400">cloudie.com/hospitality</p>
            </div>
            <div className="w-8 h-8 bg-[#0c4a6e]/10 rounded-lg flex items-center justify-center">
              <span className="text-[#0c4a6e] text-[10px] font-black">CH</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMMERCIAL INVOICE — Full professional accounting document
   ═══════════════════════════════════════════════════════════════════════════════ */
function InvoiceDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const currency = S(data.currency) || "USD";
  const tax = parseFloat(S(data.tax) || "0");
  const shipping = parseFloat(S(data.shipping) || "0");
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity ?? 0)) * (Number(item.unitPrice ?? 0)), 0);
  const total = subtotal + tax + shipping;
  const invNum = S(data.invoiceNumber) || "INV-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date();
  const dueDate = new Date(now.getTime() + 30 * 86400000);

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <div className="flex items-stretch">
        <div className="flex-1 bg-[#0c4a6e] text-white px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center border border-white/20">
              <span className="text-white text-lg font-black tracking-tighter">CI</span>
            </div>
            <div>
              <p className="text-lg font-black tracking-tight leading-tight">CLOUDIE INVOICING</p>
              <p className="text-[8px] uppercase tracking-[0.4em] text-white/50">Financial Services Platform</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 text-white px-8 py-6 flex flex-col justify-center items-end min-w-[220px]">
          <p className="text-[8px] uppercase tracking-[0.3em] text-white/50 font-bold">Commercial Invoice</p>
          <p className="text-2xl font-black mt-1 font-mono tracking-tight">{invNum}</p>
          <div className="mt-2 space-y-0.5 text-right">
            <p className="text-[9px] text-white/60">Date: {fmtDate(now.toISOString())}</p>
            <p className="text-[9px] text-white/60">Due: {fmtDate(dueDate.toISOString())}</p>
          </div>
        </div>
      </div>

      {/* ── Seller / Buyer ── */}
      <div className="mx-8 mt-6 grid grid-cols-2 gap-5">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0c4a6e] mb-2">Sold By (Vendor)</p>
          <p className="text-sm font-bold text-gray-900">{S(data.seller) || "—"}</p>
          <div className="mt-2 space-y-0.5 text-[9px] text-gray-500">
            <p>Tax ID: GB123456789</p>
            <p>VAT Reg: 123456789</p>
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0c4a6e] mb-2">Sold To (Client)</p>
          <p className="text-sm font-bold text-gray-900">{S(data.buyer) || "—"}</p>
          <div className="mt-2 space-y-0.5 text-[9px] text-gray-500">
            <p>Payment terms: Net 30</p>
            <p>Currency: {currency}</p>
          </div>
        </div>
      </div>

      {/* ── Line Items Table ── */}
      <div className="mx-8 mt-5">
        <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr className="bg-[#0c4a6e]">
              <th className="text-left px-4 py-2.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white rounded-tl-lg">#</th>
              <th className="text-left px-4 py-2.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white">Description</th>
              <th className="text-center px-3 py-2.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white w-14">Qty</th>
              <th className="text-right px-3 py-2.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white w-24">Unit Price</th>
              <th className="text-right px-4 py-2.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white w-24 rounded-tr-lg">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-4 py-2.5 text-[10px] text-gray-400 font-mono border-b border-gray-100">{String(i + 1).padStart(2, "0")}</td>
                <td className="px-4 py-2.5 text-[11px] font-medium border-b border-gray-100">{S(item.description) || "—"}</td>
                <td className="text-center px-3 py-2.5 text-[11px] border-b border-gray-100">{String(item.quantity ?? "")}</td>
                <td className="text-right px-3 py-2.5 text-[11px] border-b border-gray-100">{fmtCurrency(item.unitPrice, currency)}</td>
                <td className="text-right px-4 py-2.5 text-[11px] font-bold border-b border-gray-100">{fmtCurrency((Number(item.quantity ?? 0)) * (Number(item.unitPrice ?? 0)), currency)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-[11px] border-b border-gray-100">No line items</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Totals ── */}
      <div className="mx-8 mt-4 flex justify-end">
        <div className="w-80">
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between px-4 py-1.5">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">{fmtCurrency(subtotal, currency)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between px-4 py-1.5 bg-gray-50 rounded">
                <span className="text-gray-500">Tax (VAT)</span>
                <span className="font-medium">{fmtCurrency(tax, currency)}</span>
              </div>
            )}
            {shipping > 0 && (
              <div className="flex justify-between px-4 py-1.5">
                <span className="text-gray-500">Shipping & Handling</span>
                <span className="font-medium">{fmtCurrency(shipping, currency)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-between items-center bg-gray-900 text-white px-5 py-3.5 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Amount Due</span>
            <span className="text-xl font-black">{fmtCurrency(total, currency)}</span>
          </div>
        </div>
      </div>

      {/* ── Payment Details ── */}
      <div className="mx-8 mt-5 grid grid-cols-2 gap-4">
        <div className="p-4 bg-[#f0f9ff] rounded-lg border border-[#0c4a6e]/10">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0c4a6e] mb-2">Payment Terms</p>
          <div className="space-y-1 text-[10px] text-gray-700">
            <p>• Net 30 days from invoice date</p>
            <p>• Late payment: 1.5% monthly finance charge</p>
            <p>• All amounts in {currency}</p>
            <p>• Wire transfer preferred</p>
          </div>
        </div>
        <div className="p-4 bg-[#f0f9ff] rounded-lg border border-[#0c4a6e]/10">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0c4a6e] mb-2">Bank Details</p>
          <div className="space-y-1 text-[10px] text-gray-700">
            <p>Bank: Cloudie Financial Services</p>
            <p>Account: ****-****-****-4582</p>
            <p>SWIFT: CLDEUS33</p>
            <p>IBAN: US12 3456 7890 1234 5678</p>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(now.toISOString())}</p>
            <p className="text-[8px] text-gray-300 mt-0.5">Invoice: {invNum} · Retain for your records</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[8px] text-gray-400">cloudie.com/invoicing</p>
            </div>
            <div className="w-8 h-8 bg-[#0c4a6e]/10 rounded-lg flex items-center justify-center">
              <span className="text-[#0c4a6e] text-[10px] font-black">CI</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CUSTOMS DECLARATION — Official government-form inspired layout
   ═══════════════════════════════════════════════════════════════════════════════ */
function CustomsDocumentLayout({ data, title }: { data: Record<string, unknown>; title: string }) {
  const now = new Date();
  const declNo = "CD-" + now.getFullYear() + "-" + String(Math.floor(Math.random() * 90000) + 10000);

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Official Header ── */}
      <div className="bg-gray-900 text-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/15 rounded-lg flex items-center justify-center border border-white/20">
              <span className="text-white text-lg font-black tracking-tighter">CD</span>
            </div>
            <div>
              <p className="text-lg font-black tracking-tight leading-tight">CLOUDIE CUSTOMS</p>
              <p className="text-[8px] uppercase tracking-[0.4em] text-white/50">International Trade Compliance</p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg">
              <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-white/80">Customs Declaration</p>
            </div>
            <p className="text-[10px] text-white/50 mt-2">Declaration No: <span className="font-mono font-bold text-white/80">{declNo}</span></p>
            <p className="text-[9px] text-white/40 mt-0.5">{title}</p>
          </div>
        </div>
      </div>

      {/* ── Declaration bar ── */}
      <div className="mx-8 mt-5 px-4 py-2.5 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg">
        <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">
          Official Customs Declaration — All information must be truthful and accurate
        </p>
      </div>

      {/* ── Shipper / Consignee ── */}
      <div className="mx-8 mt-5 grid grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-[#0c4a6e] text-white px-4 py-2 flex items-center gap-2">
            <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center">
              <span className="text-[8px] font-bold">S</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Shipper / Exporter</p>
          </div>
          <div className="p-4">
            <p className="text-sm font-bold text-gray-900">{S(data.senderName) || "—"}</p>
            <p className="text-[10px] text-gray-500 mt-1">Country: {S(data.senderCountry) || "—"}</p>
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-[#0c4a6e] text-white px-4 py-2 flex items-center gap-2">
            <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center">
              <span className="text-[8px] font-bold">C</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Consignee / Importer</p>
          </div>
          <div className="p-4">
            <p className="text-sm font-bold text-gray-900">{S(data.receiverName) || "—"}</p>
            <p className="text-[10px] text-gray-500 mt-1">Country: {S(data.receiverCountry) || "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Package Information ── */}
      <div className="mx-8 mt-5 border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-600">Goods Information</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="p-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Package Description</p>
            <p className="text-[11px] font-bold text-gray-900 mt-1">{S(data.packageDescription) || "—"}</p>
          </div>
          <div className="p-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Commodity / HS Code</p>
            <p className="text-[11px] font-bold text-gray-900 mt-1">{S(data.commodity) || "—"}</p>
          </div>
          <div className="p-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Country of Origin</p>
            <p className="text-[11px] font-bold text-gray-900 mt-1">{S(data.countryOfOrigin) || "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Value & Weight ── */}
      <div className="mx-8 mt-4 grid grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Declared Value</p>
          <p className="text-xl font-black text-[#0c4a6e] mt-1">{data.value ? fmtCurrency(data.value) : "—"}</p>
          <p className="text-[8px] text-gray-400 mt-0.5">FOB {S(data.countryOfOrigin) || "—"}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Gross Weight</p>
          <p className="text-xl font-black text-gray-900 mt-1">{data.weight ? `${S(data.weight)} kg` : "—"}</p>
          <p className="text-[8px] text-gray-400 mt-0.5">Net weight: {data.weight ? `${S(data.weight)} kg` : "—"}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">No. of Packages</p>
          <p className="text-xl font-black text-gray-900 mt-1">1</p>
          <p className="text-[8px] text-gray-400 mt-0.5">Carton / box</p>
        </div>
      </div>

      {/* ── Declaration ── */}
      <div className="mx-8 mt-5 border-2 border-gray-900 rounded-lg overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Declaration of Truth</p>
        </div>
        <div className="p-5">
          <p className="text-[10px] leading-relaxed text-gray-700">
            I hereby declare that the information provided in this customs declaration is true, complete, and correct.
            The contents of this package are accurately described and the declared values represent the true commercial
            value of the goods. I understand that making a false or fraudulent customs declaration is a criminal offense
            subject to penalties under applicable trade laws and regulations.
          </p>
          {!!data.declarationInfo && (
            <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-[8px] font-bold uppercase tracking-wider text-gray-500 mb-1">Additional Information</p>
              <p className="text-[10px] text-gray-700">{S(data.declarationInfo)}</p>
            </div>
          )}
          <div className="mt-5 grid grid-cols-3 gap-4">
            <div className="border-b border-gray-300 pb-1">
              <p className="text-[9px] text-gray-400">Authorized Signature</p>
              <div className="mt-2 h-px bg-gray-200" />
            </div>
            <div className="border-b border-gray-300 pb-1">
              <p className="text-[9px] text-gray-400">Date</p>
              <p className="text-[10px] font-medium text-gray-700 mt-1">{fmtDate(now.toISOString())}</p>
            </div>
            <div className="border-b border-gray-300 pb-1">
              <p className="text-[9px] text-gray-400">Declaration No.</p>
              <p className="text-[10px] font-mono font-medium text-gray-700 mt-1">{declNo}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Regulatory Notice ── */}
      <div className="mx-8 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-[9px] font-bold uppercase tracking-wider text-red-700 mb-1">Regulatory Notice</p>
        <p className="text-[9px] leading-relaxed text-red-800">
          This declaration is subject to inspection by customs authorities. Failure to declare goods accurately may result
          in seizure, fines, or criminal prosecution. Export controls and trade sanctions may apply. Consult local regulations
          for restricted and prohibited items.
        </p>
      </div>

      {/* ── Footer ── */}
      <div className="mx-8 mt-5 mb-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(now.toISOString())}</p>
            <p className="text-[8px] text-gray-300 mt-0.5">Declaration: {declNo}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[8px] text-gray-400">cloudie.com/customs</p>
            </div>
            <div className="w-8 h-8 bg-[#0c4a6e]/10 rounded-lg flex items-center justify-center">
              <span className="text-[#0c4a6e] text-[10px] font-black">CD</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PDF BLOCK BUILDERS — Convert document data to PdfBlock[] for real PDF download
   ═══════════════════════════════════════════════════════════════════════════════ */

function buildFlightPdfBlocks(data: Record<string, unknown>, title: string): PdfBlock[] {
  const ref = S(data.bookingRef) || "CLD" + Math.random().toString(36).substring(2, 8).toUpperCase();
  return [
    { kind: "banner", text: "CLOUDIE AIR — E-TICKET ITINERARY", tone: "dark" },
    { kind: "spacer", height: 6 },
    { kind: "kv", label: "Booking Reference", value: ref },
    { kind: "kv", label: "Passenger", value: S(data.passengerName) || "—" },
    { kind: "divider" },
    { kind: "heading", text: "Flight Routing" },
    { kind: "box", title: "Departure → Arrival", lines: [
      { label: "From", value: `${S(data.departure) || "—"} (${(S(data.departure) || "—").substring(0, 3).toUpperCase()})` },
      { label: "To", value: `${S(data.arrival) || "—"} (${(S(data.arrival) || "—").substring(0, 3).toUpperCase()})` },
      { label: "Flight", value: S(data.flightNumber) || "—" },
      { label: "Airline", value: S(data.airline) || "Cloudie Air" },
      { label: "Departure", value: S(data.departureDate) ? fmtDateTime(S(data.departureDate)) : "—" },
      { label: "Arrival", value: S(data.arrivalDate) ? fmtDateTime(S(data.arrivalDate)) : "—" },
    ]},
    { kind: "heading", text: "Passenger Details" },
    { kind: "box", lines: [
      { label: "Seat", value: `${S(data.seat) || "—"} · ${S(data.cabin) || "Economy"}` },
      { label: "Baggage", value: data.baggage ? `${S(data.baggage)} checked bag(s)` : "1 checked bag" },
      { label: "Class", value: S(data.cabin) || "Economy" },
    ]},
    { kind: "divider" },
    { kind: "text", text: "IMPORTANT: This itinerary is generated by Cloudie Air as a travel record. It is not a confirmed airline ticket. Verify all details with the carrier before travel. Present valid photo ID at check-in.", size: 8.5, color: [0.45, 0.47, 0.52] },
  ];
}

function buildHotelPdfBlocks(data: Record<string, unknown>, title: string): PdfBlock[] {
  const confNum = S(data.confirmationNumber) || "HTL" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const nights = data.checkIn && data.checkOut
    ? Math.max(1, Math.round((new Date(S(data.checkOut)).getTime() - new Date(S(data.checkIn)).getTime()) / 86400000))
    : 0;
  return [
    { kind: "banner", text: "CLOUDIE HOSPITALITY — RESERVATION CONFIRMATION", tone: "dark" },
    { kind: "spacer", height: 6 },
    { kind: "kv", label: "Confirmation #", value: confNum },
    { kind: "kv", label: "Status", value: "CONFIRMED" },
    { kind: "divider" },
    { kind: "heading", text: "Property" },
    { kind: "box", lines: [
      { label: "Hotel", value: S(data.hotel) || "—" },
      { label: "Address", value: S(data.address) || "—" },
      { label: "Guest", value: S(data.guestName) || "—" },
      { label: "Guests", value: S(data.guests) || "1" },
      { label: "Room Type", value: S(data.roomType) || "Standard" },
    ]},
    { kind: "heading", text: "Stay Details" },
    { kind: "box", lines: [
      { label: "Check-in", value: data.checkIn ? fmtDate(S(data.checkIn)) + " (from 3:00 PM)" : "—" },
      { label: "Check-out", value: data.checkOut ? fmtDate(S(data.checkOut)) + " (before 11:00 AM)" : "—" },
      { label: "Duration", value: `${nights} night${nights !== 1 ? "s" : ""}` },
    ]},
    { kind: "divider" },
    { kind: "text", text: "Policies: Valid photo ID required at check-in. Free cancellation up to 24 hours before check-in. No smoking in rooms. This reservation is generated by Cloudie Hospitality.", size: 8.5, color: [0.45, 0.47, 0.52] },
  ];
}

function buildInvoicePdfBlocks(data: Record<string, unknown>, title: string): PdfBlock[] {
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const currency = S(data.currency) || "USD";
  const tax = parseFloat(S(data.tax) || "0");
  const shipping = parseFloat(S(data.shipping) || "0");
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity ?? 0)) * (Number(item.unitPrice ?? 0)), 0);
  const total = subtotal + tax + shipping;
  const invNum = S(data.invoiceNumber) || "INV-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date();
  const dueDate = new Date(now.getTime() + 30 * 86400000);

  const blocks: PdfBlock[] = [
    { kind: "banner", text: "CLOUDIE INVOICING — COMMERCIAL INVOICE", tone: "dark" },
    { kind: "spacer", height: 6 },
    { kind: "kv", label: "Invoice Number", value: invNum },
    { kind: "kv", label: "Date", value: fmtDate(now.toISOString()) },
    { kind: "kv", label: "Due Date", value: fmtDate(dueDate.toISOString()) },
    { kind: "divider" },
    { kind: "heading", text: "Parties" },
    { kind: "box", title: "Vendor", lines: [
      { label: "Name", value: S(data.seller) || "—" },
      { label: "Tax ID", value: "GB123456789" },
    ]},
    { kind: "box", title: "Client", lines: [
      { label: "Name", value: S(data.buyer) || "—" },
      { label: "Payment Terms", value: "Net 30" },
    ]},
    { kind: "heading", text: "Line Items" },
  ];

  if (items.length > 0) {
    blocks.push({
      kind: "table",
      headers: ["#", "Description", "Qty", "Unit Price", "Amount"],
      widths: [0.5, 3.5, 0.8, 1.2, 1.2],
      rows: items.map((item, i) => [
        String(i + 1).padStart(2, "0"),
        S(item.description) || "—",
        String(item.quantity ?? ""),
        fmtCurrency(item.unitPrice, currency),
        fmtCurrency((Number(item.quantity ?? 0)) * (Number(item.unitPrice ?? 0)), currency),
      ]),
    });
  }

  blocks.push(
    { kind: "divider" },
    { kind: "kv", label: "Subtotal", value: fmtCurrency(subtotal, currency) },
  );
  if (tax > 0) blocks.push({ kind: "kv", label: "Tax (VAT)", value: fmtCurrency(tax, currency) });
  if (shipping > 0) blocks.push({ kind: "kv", label: "Shipping", value: fmtCurrency(shipping, currency) });
  blocks.push(
    { kind: "spacer", height: 4 },
    { kind: "text", text: `TOTAL DUE: ${fmtCurrency(total, currency)}`, size: 13, bold: true, align: "right" },
    { kind: "divider" },
    { kind: "heading", text: "Payment Details" },
    { kind: "box", lines: [
      { label: "Bank", value: "Cloudie Financial Services" },
      { label: "SWIFT", value: "CLDEUS33" },
      { label: "Account", value: "****-****-****-4582" },
    ]},
    { kind: "text", text: "Payment is due within 30 days of invoice date. Late payments may incur a 1.5% monthly finance charge. Retain for your records.", size: 8.5, color: [0.45, 0.47, 0.52] },
  );

  return blocks;
}

function buildCustomsPdfBlocks(data: Record<string, unknown>, title: string): PdfBlock[] {
  const now = new Date();
  const declNo = "CD-" + now.getFullYear() + "-" + String(Math.floor(Math.random() * 90000) + 10000);

  return [
    { kind: "banner", text: "CLOUDIE CUSTOMS — DECLARATION", tone: "dark" },
    { kind: "spacer", height: 6 },
    { kind: "kv", label: "Declaration No.", value: declNo },
    { kind: "kv", label: "Date", value: fmtDate(now.toISOString()) },
    { kind: "divider" },
    { kind: "heading", text: "Parties" },
    { kind: "box", title: "Shipper / Exporter", lines: [
      { label: "Name", value: S(data.senderName) || "—" },
      { label: "Country", value: S(data.senderCountry) || "—" },
    ]},
    { kind: "box", title: "Consignee / Importer", lines: [
      { label: "Name", value: S(data.receiverName) || "—" },
      { label: "Country", value: S(data.receiverCountry) || "—" },
    ]},
    { kind: "heading", text: "Goods Information" },
    { kind: "box", lines: [
      { label: "Description", value: S(data.packageDescription) || "—" },
      { label: "Commodity / HS Code", value: S(data.commodity) || "—" },
      { label: "Country of Origin", value: S(data.countryOfOrigin) || "—" },
      { label: "Declared Value", value: data.value ? fmtCurrency(data.value) : "—" },
      { label: "Gross Weight", value: data.weight ? `${S(data.weight)} kg` : "—" },
    ]},
    { kind: "divider" },
    { kind: "heading", text: "Declaration" },
    { kind: "text", text: "I hereby declare that the information provided in this customs declaration is true, complete, and correct. The contents of this package are accurately described and the declared values represent the true commercial value of the goods.", size: 9 },
    { kind: "text", text: `Date: ${fmtDate(now.toISOString())} · Declaration: ${declNo}`, size: 8.5, color: [0.45, 0.47, 0.52] },
  ];
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

const PDF_BUILDERS: Record<DocumentType, (data: Record<string, unknown>, title: string) => PdfBlock[]> = {
  flight: buildFlightPdfBlocks,
  hotel: buildHotelPdfBlocks,
  invoice: buildInvoicePdfBlocks,
  customs: buildCustomsPdfBlocks,
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

  const downloadPdf = useCallback(() => {
    try {
      const builder = PDF_BUILDERS[docType];
      if (!builder) {
        toast.error("PDF not available for this document type");
        return;
      }
      const blocks = builder(doc.data, doc.title);
      const result = renderPdf(blocks, {
        pageSize: "A4",
        title: doc.title,
        footer: `Generated by Cloudie · ${doc.title}`,
      });
      const buf = new ArrayBuffer(result.bytes.length); new Uint8Array(buf).set(result.bytes); const blob = new Blob([buf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.type}-${doc.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded successfully");
    } catch (err) {
      toast.error("Could not generate PDF");
      console.error("PDF generation error:", err);
    }
  }, [docType, doc.data, doc.title]);

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
        <Button size="sm" onClick={downloadPdf} className="gap-1.5">
          <Download className="h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* Document preview */}
      <div className="rounded-xl border border-border overflow-hidden shadow-lg shadow-black/5 relative">
        <div ref={contentRef}>
          {docType === "flight" && <FlightDocumentLayout data={doc.data} title={doc.title} />}
          {docType === "hotel" && <HotelDocumentLayout data={doc.data} title={doc.title} />}
          {docType === "invoice" && <InvoiceDocumentLayout data={doc.data} title={doc.title} />}
          {docType === "customs" && <CustomsDocumentLayout data={doc.data} title={doc.title} />}
          {!["flight", "hotel", "invoice", "customs"].includes(docType) && (
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
