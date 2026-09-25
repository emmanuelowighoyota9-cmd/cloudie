import { useRef } from "react";
import { snapdom } from "@zumer/snapdom";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { QrCodeSvg, BarcodeSvg } from "@/components/tracking/Codes";
import { trackingUrl } from "@/lib/trackingUi";
import { motion } from "framer-motion";

export type ReceiptShipment = {
  trackingNumber: string;
  referenceNumber?: string | null;
  serviceTypeName?: string | null;
  carrierName?: string | null;
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderState: string;
  senderCountry: string;
  senderPostalCode: string;
  senderEmail: string;
  senderPhone: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientState: string;
  recipientCountry: string;
  recipientPostalCode: string;
  recipientEmail: string;
  recipientPhone: string;
  packageDescription: string;
  totalWeight: number;
  weightUnit: string;
  dimensions?: string | null;
  declaredValue?: number | null;
  currency?: string | null;
  notes?: string | null;
  createdAt: number;
  estimatedDelivery?: number | null;
  deliveredAt?: number | null;
  status: string;
  progress: number;
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusColor(status: string) {
  const s = status.toUpperCase();
  if (s === "DELIVERED") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (s.includes("TRANSIT") || s === "IN_TRANSIT") return "bg-blue-100 text-blue-800 border-blue-300";
  if (s.includes("CANCEL") || s === "CANCELLED") return "bg-red-100 text-red-800 border-red-300";
  return "bg-[#f0faf9] text-[#0f766e] border-[#0f766e]/20";
}

export function ShipmentReceipt({ shipment }: { shipment: ReceiptShipment }) {
  const ref = useRef<HTMLDivElement>(null);

  const print = () => window.print();

  const download = async () => {
    if (!ref.current) return;
    try {
      const canvas = await snapdom.toCanvas(ref.current, { scale: 2 });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${shipment.trackingNumber}.png`;
      a.click();
      toast.success("Receipt downloaded");
    } catch {
      toast.error("Could not render receipt");
    }
  };

  const subtotal = shipment.declaredValue ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={print}>
          <Printer className="mr-1.5 h-4 w-4" /> Print Receipt
        </Button>
        <Button size="sm" onClick={download}>
          <Download className="mr-1.5 h-4 w-4" /> Download Receipt
        </Button>
      </div>

      <div
        ref={ref}
        className="mx-auto w-full max-w-[750px] bg-white text-gray-900 rounded-xl overflow-hidden shadow-lg shadow-black/5"
        style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
      >
        {/* ── Branded Header ── */}
        <div className="bg-[#0f766e] text-white px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center">
                <span className="text-white text-lg font-extrabold">C</span>
              </div>
              <div>
                <p className="text-lg font-extrabold tracking-tight leading-tight">CLOUDIE</p>
                <p className="text-[9px] uppercase tracking-[0.35em] text-white/50">Global Logistics</p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-white/10 rounded text-[9px] font-bold uppercase tracking-[0.2em] text-white/80">
                Shipment Receipt
              </div>
              <p className="text-[10px] text-white/50 mt-2">{fmtDateTime(shipment.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* ── Tracking + Status Bar ── */}
        <div className="mx-8 mt-5 flex items-center justify-between">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Tracking Number</p>
            <p className="text-xl font-extrabold text-[#0f766e] font-mono tracking-wider mt-0.5">{shipment.trackingNumber}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusColor(shipment.status)}`}>
            {shipment.status.replace(/_/g, " ")}
          </div>
        </div>

        {/* ── Barcode + QR ── */}
        <div className="mx-8 mt-4 flex items-center justify-between gap-4 py-3 border-t border-b border-gray-100">
          <BarcodeSvg value={shipment.trackingNumber} height={44} moduleWidth={1.5} />
          <QrCodeSvg value={trackingUrl(shipment.trackingNumber)} size={60} />
        </div>

        {/* ── Sender / Recipient ── */}
        <div className="mx-8 mt-5 grid grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-1.5 border-b border-gray-200">
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500">Ship From</p>
            </div>
            <div className="p-4">
              <p className="text-sm font-bold text-gray-900">{shipment.senderName}</p>
              <p className="text-xs text-gray-500 mt-1">{shipment.senderAddress}</p>
              <p className="text-xs text-gray-500">{[shipment.senderCity, shipment.senderState].filter(Boolean).join(", ")} {shipment.senderPostalCode}</p>
              <p className="text-xs text-gray-500">{shipment.senderCountry}</p>
              {(shipment.senderEmail || shipment.senderPhone) && (
                <p className="text-[10px] text-gray-400 mt-2">{shipment.senderEmail} · {shipment.senderPhone}</p>
              )}
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-[#0f766e] px-4 py-1.5">
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/80">Ship To</p>
            </div>
            <div className="p-4 bg-[#f0faf9]/50">
              <p className="text-sm font-bold text-gray-900">{shipment.recipientName}</p>
              <p className="text-xs text-gray-500 mt-1">{shipment.recipientAddress}</p>
              <p className="text-xs text-gray-500">{[shipment.recipientCity, shipment.recipientState].filter(Boolean).join(", ")} {shipment.recipientPostalCode}</p>
              <p className="text-xs text-gray-500">{shipment.recipientCountry}</p>
              {(shipment.recipientEmail || shipment.recipientPhone) && (
                <p className="text-[10px] text-gray-400 mt-2">{shipment.recipientEmail} · {shipment.recipientPhone}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Shipment Details Grid ── */}
        <div className="mx-8 mt-5 grid grid-cols-4 gap-3">
          {[
            { label: "Service", value: shipment.serviceTypeName ?? "Standard" },
            { label: "Carrier", value: shipment.carrierName ?? "—" },
            { label: "Weight", value: `${shipment.totalWeight} ${shipment.weightUnit}` },
            { label: "Dimensions", value: shipment.dimensions ?? "—" },
          ].map((item) => (
            <div key={item.label} className="p-3 bg-gray-50 rounded-lg text-center border border-gray-100">
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">{item.label}</p>
              <p className="text-xs font-bold text-gray-900 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>

        {/* ── Package ── */}
        <div className="mx-8 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Package Description</p>
          <p className="text-sm font-medium text-gray-900">{shipment.packageDescription}</p>
        </div>

        {/* ── Delivery + Value ── */}
        <div className="mx-8 mt-4 grid grid-cols-2 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Estimated Delivery</p>
            <p className="text-sm font-bold text-gray-900">
              {shipment.estimatedDelivery ? fmtDate(shipment.estimatedDelivery) : "Pending"}
            </p>
            {shipment.deliveredAt && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-0.5">Delivered On</p>
                <p className="text-xs font-bold text-emerald-700">{fmtDateTime(shipment.deliveredAt)}</p>
              </div>
            )}
          </div>
          {subtotal > 0 && (
            <div className="p-4 bg-[#f0faf9] rounded-lg border border-[#0f766e]/10">
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#0f766e]/60 mb-1">Declared Value</p>
              <p className="text-lg font-extrabold text-[#0f766e]">{shipment.currency ?? "$"} {subtotal.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* ── Reference / Notes ── */}
        {(shipment.referenceNumber || shipment.notes) && (
          <div className="mx-8 mt-4 space-y-1">
            {shipment.referenceNumber && (
              <p className="text-[10px] text-gray-500">
                <span className="font-bold">Reference:</span> {shipment.referenceNumber}
              </p>
            )}
            {shipment.notes && (
              <p className="text-[10px] text-gray-500">
                <span className="font-bold">Notes:</span> {shipment.notes}
              </p>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mx-8 mt-6 mb-6 pt-4 border-t border-gray-200">
          <p className="text-[9px] text-gray-400 text-center leading-relaxed">
            This receipt confirms your shipment has been registered in the Crestline Express global tracking system.
            <br />Track your shipment at cloudie.com/tracking/{shipment.trackingNumber}
          </p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <p className="text-[9px] text-gray-400">Generated on {fmtDateTime(Date.now())}</p>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-[#0f766e]/10 rounded flex items-center justify-center">
                <span className="text-[#0f766e] text-[7px] font-bold">C</span>
              </div>
              <p className="text-[9px] text-gray-400">cloudie.com</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
