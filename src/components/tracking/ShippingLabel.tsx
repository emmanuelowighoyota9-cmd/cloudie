import { useRef } from "react";
import { snapdom } from "@zumer/snapdom";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { QrCodeSvg, BarcodeSvg } from "./Codes";

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

function AddressBlock({
  heading,
  name,
  address,
  city,
  state,
  country,
  postalCode,
  accent,
}: {
  heading: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  accent: string;
}) {
  return (
    <div className="min-w-0">
      <p className={`text-[10px] font-bold uppercase tracking-widest ${accent}`}>{heading}</p>
      <p className="mt-1 truncate text-[13px] font-bold text-black">{name}</p>
      <p className="text-[11px] leading-tight text-black">{address}</p>
      <p className="text-[11px] leading-tight text-black">
        {[city, state].filter(Boolean).join(", ")} {postalCode} — {country}
      </p>
    </div>
  );
}

/**
 * Native shipping label — pure DOM/SVG rendered from the application's own
 * database. Print uses the browser; Download rasterizes the DOM via the
 * already-bundled snapdom utility (no external service, works offline).
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
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="mr-1.5 h-4 w-4" /> Download label
        </Button>
      </div>

      <div
        ref={labelRef}
        id="shipping-label"
        className="mx-auto w-full max-w-[420px] rounded-md border-2 border-black bg-white p-4 text-black"
      >
        {/* Header: brand + tracking */}
        <div className="flex items-start justify-between border-b-2 border-black pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-black">
              <span className="text-[13px] font-black text-white">C</span>
            </div>
            <div>
              <p className="text-sm font-black leading-none tracking-tight">CLOUDIE</p>
              <p className="text-[8px] font-semibold uppercase tracking-[0.25em] text-black">
                Global Logistics
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-bold uppercase tracking-widest">Tracking #</p>
            <p className="font-mono text-[12px] font-bold">{shipment.trackingNumber}</p>
            {shipment.referenceNumber && (
              <p className="text-[9px] text-black">Ref: {shipment.referenceNumber}</p>
            )}
          </div>
        </div>

        {/* Barcode + QR */}
        <div className="flex items-center justify-between gap-3 py-3">
          <BarcodeSvg value={shipment.trackingNumber} height={56} moduleWidth={2} />
          <QrCodeSvg value={`/tracking/${shipment.trackingNumber}`} size={76} ecl="medium" />
        </div>

        {/* Addresses */}
        <div className="grid grid-cols-2 gap-3 border-t border-black pt-2">
          <AddressBlock
            heading="From (Sender)"
            name={shipment.senderName}
            address={shipment.senderAddress}
            city={shipment.senderCity}
            state={shipment.senderState}
            country={shipment.senderCountry}
            postalCode={shipment.senderPostalCode}
            accent="text-slate-500"
          />
          <div className="border-l border-dashed border-black pl-3">
            <AddressBlock
              heading="To (Recipient)"
              name={shipment.recipientName}
              address={shipment.recipientAddress}
              city={shipment.recipientCity}
              state={shipment.recipientState}
              country={shipment.recipientCountry}
              postalCode={shipment.recipientPostalCode}
              accent="text-blue-700"
            />
          </div>
        </div>

        {/* Service / route / package meta */}
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-black pt-2 text-[10px]">
          <div>
            <p className="font-bold uppercase tracking-widest text-slate-500">Service</p>
            <p className="font-semibold">{shipment.serviceTypeName ?? "Standard"}</p>
          </div>
          <div>
            <p className="font-bold uppercase tracking-widest text-slate-500">Route</p>
            <p className="font-semibold">{originLabel} → {destinationLabel}</p>
          </div>
          <div>
            <p className="font-bold uppercase tracking-widest text-slate-500">Weight</p>
            <p className="font-semibold">
              {shipment.totalWeight} {shipment.weightUnit}
            </p>
          </div>
        </div>

        {/* Package row */}
        {pkg && (
          <div className="mt-2 flex items-center justify-between border-t border-black pt-2 text-[10px]">
            <div>
              <p className="font-bold uppercase tracking-widest text-slate-500">
                Package {pkg.packageNumber}
                {packages.length > 1 ? ` of ${packages.length}` : ""}
              </p>
              <p className="font-semibold">
                {pkg.description} · {pkg.packageType} · {pkg.weight} {shipment.weightUnit}
                {pkg.dimensions ? ` · ${pkg.dimensions}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold uppercase tracking-widest text-slate-500">Ship date</p>
              <p className="font-semibold">{new Date(shipment.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
