import { useRef } from "react";
import { snapdom } from "@zumer/snapdom";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { QrCodeSvg, BarcodeSvg } from "./Codes";
import { trackingUrl } from "@/lib/trackingUi";

export type LabelShipment = {
  trackingNumber: string;
  referenceNumber?: string | null;
  serviceTypeName?: string | null;
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderState: string;
  senderCountry: string;
  senderPostalCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientState: string;
  recipientCountry: string;
  recipientPostalCode: string;
  totalWeight: number;
  weightUnit: string;
  dimensions?: string | null;
  declaredValue?: number | null;
  currency?: string | null;
  createdAt: number;
};

export type LabelPackage = {
  packageNumber: number;
  trackingNumber: string;
  description: string;
  packageType: string;
  weight: number;
  dimensions?: string | null;
  quantity: number;
};

/**
 * Native shipping label — modern branded waybill design.
 * Print uses the browser; Download rasterizes via snapdom (no external service).
 */
export function ShippingLabel({
  shipment,
  packages,
  originLabel,
  destinationLabel,
}: {
  shipment: LabelShipment;
  packages: LabelPackage[];
  originLabel: string;
  destinationLabel: string;
}) {
  const labelRef = useRef<HTMLDivElement>(null);

  const print = () => {
    window.print();
  };

  const download = async () => {
    if (!labelRef.current) return;
    try {
      const canvas = await snapdom.toCanvas(labelRef.current, { scale: 2 });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `label-${shipment.trackingNumber}.png`;
      a.click();
      toast.success("Label downloaded");
    } catch {
      toast.error("Could not render label image");
    }
  };

  const pkg = packages[0];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={print}>
          <Printer className="mr-1.5 h-4 w-4" /> Print label
        </Button>
        <Button size="sm" onClick={download}>
          <Download className="mr-1.5 h-4 w-4" /> Download label
        </Button>
      </div>

      <div
        ref={labelRef}
        id="shipping-label"
        className="mx-auto w-full max-w-[420px] bg-white rounded-xl overflow-hidden shadow-lg shadow-black/5 text-gray-900"
        style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
      >
        {/* ── Header ── */}
        <div className="bg-[#0f766e] text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white/15 rounded-md flex items-center justify-center">
              <span className="text-white text-xs font-extrabold">C</span>
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-tight leading-none">CLOUDIE</p>
              <p className="text-[7px] uppercase tracking-[0.3em] text-white/50">Global Logistics</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/60">Shipping Label</p>
          </div>
        </div>

        {/* ── Tracking Bar ── */}
        <div className="mx-5 mt-3 flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 border border-gray-100">
          <div>
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Tracking #</p>
            <p className="text-sm font-extrabold text-[#0f766e] font-mono">{shipment.trackingNumber}</p>
          </div>
          {shipment.referenceNumber && (
            <div className="text-right">
              <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Ref #</p>
              <p className="text-xs font-bold text-gray-700 font-mono">{shipment.referenceNumber}</p>
            </div>
          )}
        </div>

        {/* ── Barcode + QR ── */}
        <div className="mx-5 mt-3 flex items-center justify-between gap-3 py-2 border-t border-b border-gray-100">
          <BarcodeSvg value={shipment.trackingNumber} height={50} moduleWidth={2} />
          <QrCodeSvg value={trackingUrl(shipment.trackingNumber)} size={64} ecl="medium" />
        </div>

        {/* ── From / To ── */}
        <div className="mx-5 mt-3 grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">From</p>
            <p className="text-[11px] font-bold text-gray-900 leading-tight">{shipment.senderName}</p>
            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{shipment.senderAddress}</p>
            <p className="text-[10px] text-gray-500 leading-tight">
              {[shipment.senderCity, shipment.senderState].filter(Boolean).join(", ")} {shipment.senderPostalCode}
            </p>
            <p className="text-[10px] text-gray-500 leading-tight">{shipment.senderCountry}</p>
          </div>
          <div className="p-3 bg-[#f0faf9] rounded-lg border border-[#0f766e]/10">
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-[#0f766e]/60 mb-1">To</p>
            <p className="text-[11px] font-bold text-gray-900 leading-tight">{shipment.recipientName}</p>
            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{shipment.recipientAddress}</p>
            <p className="text-[10px] text-gray-500 leading-tight">
              {[shipment.recipientCity, shipment.recipientState].filter(Boolean).join(", ")} {shipment.recipientPostalCode}
            </p>
            <p className="text-[10px] text-gray-500 leading-tight">{shipment.recipientCountry}</p>
          </div>
        </div>

        {/* ── Service / Route / Weight ── */}
        <div className="mx-5 mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Service", value: shipment.serviceTypeName ?? "Standard" },
            { label: "Route", value: `${originLabel} → ${destinationLabel}` },
            { label: "Weight", value: `${shipment.totalWeight} ${shipment.weightUnit}` },
          ].map((item) => (
            <div key={item.label} className="p-2 bg-gray-50 rounded text-center border border-gray-100">
              <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">{item.label}</p>
              <p className="text-[10px] font-bold text-gray-900 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>

        {/* ── Package row ── */}
        {pkg && (
          <div className="mx-5 mt-3 mb-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">
                Package {pkg.packageNumber}{packages.length > 1 ? ` of ${packages.length}` : ""}
              </p>
              <p className="text-[10px] font-semibold text-gray-900 mt-0.5">
                {pkg.description} · {pkg.packageType} · {pkg.weight} {shipment.weightUnit}
                {pkg.dimensions ? ` · ${pkg.dimensions}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-gray-400">Ship date</p>
              <p className="text-[10px] font-semibold text-gray-900 mt-0.5">{new Date(shipment.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
