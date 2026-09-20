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
        className="mx-auto w-full max-w-[700px] rounded-md border-2 border-black bg-white p-6 text-black"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-black">C</span>
            </div>
            <div>
              <p className="text-xl font-black tracking-tight">CLOUDIE</p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Global Logistics</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Shipment Receipt</p>
            <p className="text-xs text-gray-500 mt-1">{fmtDateTime(shipment.createdAt)}</p>
          </div>
        </div>

        {/* Tracking + Status */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Tracking Number</p>
            <p className="text-lg font-mono font-black">{shipment.trackingNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Status</p>
            <p className="text-sm font-bold mt-0.5">{shipment.status.replace(/_/g, " ")}</p>
          </div>
        </div>

        {/* Barcode + QR */}
        <div className="flex items-center justify-between gap-4 py-3 border-t border-b border-gray-200">
          <BarcodeSvg value={shipment.trackingNumber} height={48} moduleWidth={1.5} />
          <QrCodeSvg value={trackingUrl(shipment.trackingNumber)} size={64} />
        </div>

        {/* Addresses */}
        <div className="grid grid-cols-2 gap-4 my-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Sender</p>
            <p className="text-sm font-bold mt-1">{shipment.senderName}</p>
            <p className="text-xs text-gray-600">{shipment.senderAddress}</p>
            <p className="text-xs text-gray-600">{[shipment.senderCity, shipment.senderState].filter(Boolean).join(", ")} {shipment.senderPostalCode}</p>
            <p className="text-xs text-gray-600">{shipment.senderCountry}</p>
            <p className="text-[10px] text-gray-400 mt-1">{shipment.senderEmail} · {shipment.senderPhone}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border-l-4 border-black">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Recipient</p>
            <p className="text-sm font-bold mt-1">{shipment.recipientName}</p>
            <p className="text-xs text-gray-600">{shipment.recipientAddress}</p>
            <p className="text-xs text-gray-600">{[shipment.recipientCity, shipment.recipientState].filter(Boolean).join(", ")} {shipment.recipientPostalCode}</p>
            <p className="text-xs text-gray-600">{shipment.recipientCountry}</p>
            <p className="text-[10px] text-gray-400 mt-1">{shipment.recipientEmail} · {shipment.recipientPhone}</p>
          </div>
        </div>

        {/* Shipment details */}
        <div className="grid grid-cols-4 gap-3 my-4">
          {[
            ["Service", shipment.serviceTypeName ?? "Standard"],
            ["Carrier", shipment.carrierName ?? "—"],
            ["Weight", `${shipment.totalWeight} ${shipment.weightUnit}`],
            ["Dimensions", shipment.dimensions ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="p-2 bg-gray-50 rounded text-center">
              <p className="text-[9px] uppercase tracking-widest text-gray-500">{label}</p>
              <p className="text-xs font-bold mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Package */}
        <div className="border-t border-gray-200 pt-3 my-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Package</p>
          <p className="text-sm font-medium">{shipment.packageDescription}</p>
        </div>

        {/* Delivery info */}
        <div className="grid grid-cols-2 gap-4 my-4 p-3 border border-gray-200 rounded-lg">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Estimated Delivery</p>
            <p className="text-sm font-bold mt-0.5">
              {shipment.estimatedDelivery ? fmtDate(shipment.estimatedDelivery) : "Pending"}
            </p>
          </div>
          {shipment.deliveredAt && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Delivered On</p>
              <p className="text-sm font-bold mt-0.5">{fmtDateTime(shipment.deliveredAt)}</p>
            </div>
          )}
        </div>

        {/* Cost summary */}
        {subtotal > 0 && (
          <div className="border-t border-gray-200 pt-3 my-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Declared Value</span>
              <span className="font-bold">{shipment.currency ?? "$"} {subtotal.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Reference */}
        {shipment.referenceNumber && (
          <div className="text-xs text-gray-500 mt-2">
            <span className="font-bold">Reference:</span> {shipment.referenceNumber}
          </div>
        )}
        {shipment.notes && (
          <div className="text-xs text-gray-500 mt-1">
            <span className="font-bold">Notes:</span> {shipment.notes}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-3 border-t-2 border-black text-[10px] text-gray-500">
          <p>This receipt confirms that your shipment has been registered in the Cloudie Global Logistics tracking system.</p>
          <p className="mt-1">Track at: cloudie.com/tracking/{shipment.trackingNumber}</p>
          <p className="mt-1">Generated on {fmtDateTime(Date.now())}</p>
        </div>
      </div>
    </motion.div>
  );
}
