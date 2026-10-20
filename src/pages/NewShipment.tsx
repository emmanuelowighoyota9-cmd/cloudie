import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  Package,
  Save,
  Truck,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { neonApi } from "@/lib/neonApi";
import { notifyNeonQueries } from "@/lib/neonClient";
import { usePricing } from "@/lib/pricing";
import { EASE_OUT_QUINT } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ── Reference data ────────────────────────────────────────────── */

const COUNTRIES = [
  "Nigeria", "Ghana", "Kenya", "South Africa", "Egypt", "Morocco",
  "United Kingdom", "Ireland", "France", "Germany", "Netherlands", "Spain",
  "Italy", "Portugal", "Sweden", "Norway", "Denmark", "Switzerland", "Poland", "Turkey",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "India", "Pakistan", "Bangladesh",
  "China", "Japan", "South Korea", "Singapore", "Malaysia", "Indonesia", "Philippines",
  "Australia", "New Zealand", "United States", "Canada", "Mexico",
  "Brazil", "Argentina", "Chile", "Colombia", "Peru",
];

/**
 * Region lists for the markets this workspace ships to most. Countries without
 * a list fall back to a free-text region field rather than guessing boundaries.
 */
const STATES_BY_COUNTRY: Record<string, string[]> = {
  Nigeria: [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT – Abuja", "Gombe",
    "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
    "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
    "Taraba", "Yobe", "Zamfara",
  ],
  "United States": [
    "California", "New York", "Texas", "Florida", "Illinois", "Georgia", "Washington",
    "Massachusetts", "Pennsylvania", "Ohio", "New Jersey", "Virginia", "Arizona",
    "Colorado", "North Carolina", "Michigan", "Maryland", "Nevada", "Oregon", "Tennessee",
  ],
  "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
  Canada: [
    "Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan",
    "Nova Scotia", "New Brunswick", "Newfoundland and Labrador", "Prince Edward Island",
  ],
  "United Arab Emirates": [
    "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain",
  ],
  Ghana: [
    "Greater Accra", "Ashanti", "Western", "Eastern", "Central", "Northern", "Volta",
    "Upper East", "Upper West", "Bono",
  ],
  Kenya: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Malindi"],
  "South Africa": [
    "Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State", "Limpopo",
    "Mpumalanga", "North West", "Northern Cape",
  ],
  India: [
    "Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "Telangana", "Gujarat",
    "West Bengal", "Rajasthan", "Kerala", "Uttar Pradesh",
  ],
};

const STEPS = [
  { number: 1, label: "Sender" },
  { number: 2, label: "Recipient" },
  { number: 3, label: "Parcel" },
  { number: 4, label: "Review" },
] as const;

type ParcelType = "parcel" | "freight";

type Party = {
  name: string;
  phone: string;
  email: string;
  address: string;
  country: string;
  state: string;
  postalCode: string;
};

type Parcel = {
  type: ParcelType;
  weight: string;
  length: string;
  width: string;
  height: string;
  declaredValue: string;
  description: string;
};

type Draft = {
  step: number;
  sender: Party;
  recipient: Party;
  parcel: Parcel;
  savedAt: number;
};

const emptyParty = (): Party => ({
  name: "",
  phone: "",
  email: "",
  address: "",
  country: "Nigeria",
  state: "",
  postalCode: "",
});

const emptyParcel = (): Parcel => ({
  type: "parcel",
  weight: "",
  length: "",
  width: "",
  height: "",
  declaredValue: "",
  description: "",
});

/* ── Validation ────────────────────────────────────────────────── */

type Errors = Record<string, string>;

/** Shared blur/aria wiring for a validated control. */
type FieldAttrs = {
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  onBlur: () => void;
};

function validateParty(prefix: "sender" | "recipient", party: Party, emailOptional = true): Errors {
  const errors: Errors = {};
  const set = (field: string, message: string) => {
    errors[`${prefix}.${field}`] = message;
  };

  if (party.name.trim().length < 2) set("name", "Enter the full name.");
  const phone = party.phone.replace(/[^\d]/g, "");
  if (phone.length < 7) set("phone", "Enter a phone number with at least 7 digits.");
  if (!party.address.trim() || party.address.trim().length < 5) set("address", "Enter the street address.");
  if (!party.country) set("country", "Select a country.");
  if (!party.state.trim()) set("state", "Select a state or region.");
  if (party.postalCode.trim().length < 3) set("postalCode", "Enter the postal code.");
  if (!emailOptional && !party.email.trim()) set("email", "Enter an email address.");

  const email = party.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    set("email", "Enter a valid email address.");
  }
  return errors;
}

function validateParcel(parcel: Parcel): Errors {
  const errors: Errors = {};
  const weight = Number(parcel.weight);
  if (!parcel.weight.trim() || !Number.isFinite(weight) || weight <= 0) {
    errors["parcel.weight"] = "Enter a weight greater than 0.";
  } else if (weight > 5000) {
    errors["parcel.weight"] = "Weight above 5,000 kg needs freight booking.";
  }

  for (const dimension of ["length", "width", "height"] as const) {
    const value = Number(parcel[dimension]);
    if (!parcel[dimension].trim() || !Number.isFinite(value) || value <= 0) {
      errors[`parcel.${dimension}`] = "Required.";
    }
  }

  if (parcel.declaredValue.trim()) {
    const declared = Number(parcel.declaredValue);
    if (!Number.isFinite(declared) || declared < 0) {
      errors["parcel.declaredValue"] = "Enter a valid amount.";
    }
  }

  if (parcel.description.trim().length < 3) {
    errors["parcel.description"] = "Describe what you're sending.";
  }
  return errors;
}

const STEP_FIELDS: Record<number, string[]> = {
  1: ["name", "phone", "address", "country", "state", "postalCode"].map((field) => `sender.${field}`),
  2: ["name", "phone", "address", "country", "state", "postalCode", "email"].map((field) => `recipient.${field}`),
  3: ["parcel.type", "parcel.weight", "parcel.length", "parcel.width", "parcel.height", "parcel.declaredValue", "parcel.description"],
  4: [],
};

/* ── Field shell ───────────────────────────────────────────────── */

function Field({
  id,
  label,
  error,
  hint,
  required = true,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden> *</span>
        ) : (
          <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function NewShipment() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { price, ngnPerPoint } = usePricing();
  const shipmentPrice = price("shipment_create", 100);
  const costPoints = Number(shipmentPrice.points);
  const balanceNgn = useQuery(api.wallet.getBalance);
  const pointsBalance =
    typeof balanceNgn === "number" && ngnPerPoint > 0
      ? Math.round(balanceNgn / ngnPerPoint)
      : undefined;
  const balanceAfter = pointsBalance !== undefined ? pointsBalance - costPoints : undefined;
  const canAfford = pointsBalance !== undefined && pointsBalance >= costPoints;

  const [step, setStep] = useState(1);
  const [sender, setSender] = useState<Party>(emptyParty);
  const [recipient, setRecipient] = useState<Party>(emptyParty);
  const [parcel, setParcel] = useState<Parcel>(emptyParcel);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const restoredRef = useRef(false);

  const draftKey = `cloudie:shipment-draft:v1:${user?.id ?? "anon"}`;

  /* Restore a draft once the account is known. */
  useEffect(() => {
    if (!user?.id || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<Draft>;
      if (draft.sender) setSender({ ...emptyParty(), ...draft.sender });
      if (draft.recipient) setRecipient({ ...emptyParty(), ...draft.recipient });
      if (draft.parcel) setParcel({ ...emptyParcel(), ...draft.parcel });
      if (typeof draft.step === "number") setStep(Math.min(4, Math.max(1, draft.step)));
      if (typeof draft.savedAt === "number") setSavedAt(draft.savedAt);
      setDirty(true);
    } catch {
      /* A corrupt draft shouldn't block a fresh shipment. */
    }
  }, [user?.id, draftKey]);

  /* Autosave, debounced. Nothing is written until the user has typed. */
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      const draft: Draft = { step, sender, recipient, parcel, savedAt: Date.now() };
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
        setSavedAt(draft.savedAt);
      } catch {
        /* Private mode or a full quota — the form still works in memory. */
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dirty, step, sender, recipient, parcel, draftKey]);

  const savedLabel = useMemo(() => {
    if (savedAt === null) return "Not saved yet";
    const minutes = Math.floor((Date.now() - savedAt) / 60_000);
    if (minutes < 1) return "Saved just now";
    if (minutes < 60) return `Saved ${minutes}m ago`;
    return `Saved at ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [savedAt]);

  const errors = useMemo(
    () => ({
      // The sender's email is taken from the signed-in account, not a field.
      ...validateParty("sender", sender, true),
      ...validateParty("recipient", recipient, true),
      ...validateParcel(parcel),
    }),
    [sender, recipient, parcel],
  );

  const visibleErrors: Errors = {};
  for (const [key, message] of Object.entries(errors)) {
    const ownerStep = key.startsWith("sender.") ? 1 : key.startsWith("recipient.") ? 2 : 3;
    if (touched[key] || attempted[ownerStep]) visibleErrors[key] = message;
  }

  const touchedAttrs = (key: string): FieldAttrs => ({
    "aria-invalid": Boolean(visibleErrors[key]),
    "aria-describedby": visibleErrors[key] ? `${key.replace(/\./g, "-")}-error` : undefined,
    onBlur: () => setTouched((current) => (current[key] ? current : { ...current, [key]: true })),
  });

  const updateParty = (which: "sender" | "recipient") =>
    (field: keyof Party) =>
      (value: string) => {
        setDirty(true);
        if (which === "sender") {
          setSender((current) => {
            const next = { ...current, [field]: value };
            if (field === "country") next.state = "";
            return next;
          });
        } else {
          setRecipient((current) => {
            const next = { ...current, [field]: value };
            if (field === "country") next.state = "";
            return next;
          });
        }
      };

  const updateParcel = (field: keyof Parcel) => (value: string) => {
    setDirty(true);
    setParcel((current) => ({ ...current, [field]: value }));
  };

  const stepFieldsValid = (target: number) =>
    STEP_FIELDS[target].every((key) => !errors[key]);

  const goNext = () => {
    setAttempted((current) => ({ ...current, [step]: true }));
    if (!stepFieldsValid(step)) return;
    setStep((current) => Math.min(4, current + 1));
  };

  const goBack = () => {
    if (step === 1) {
      navigate("/shipments");
      return;
    }
    setStep((current) => Math.max(1, current - 1));
  };

  const saveDraft = () => {
    const draft: Draft = { step, sender, recipient, parcel, savedAt: Date.now() };
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      setSavedAt(draft.savedAt);
      toast.success("Draft saved on this device");
    } catch {
      toast.error("Could not save the draft in this browser");
    }
  };

  const submit = async () => {
    setSubmitError(null);
    const allValid = [1, 2, 3].every((target) => stepFieldsValid(target));
    if (!allValid) {
      const firstInvalid = [1, 2, 3].find((target) => !stepFieldsValid(target)) ?? 1;
      setAttempted({ 1: true, 2: true, 3: true });
      setStep(firstInvalid);
      setSubmitError("Some details still need attention. Check the highlighted fields.");
      return;
    }
    if (!canAfford) return;

    setSubmitting(true);
    try {
      /*
       * The create endpoint wants flat snake/camel keys; the Convex mutation's
       * nested payload is what it replaced. `neonApi.createShipment` is the
       * call that actually persists here, so it is used directly and the
       * mounted queries are re-notified afterwards.
       */
      const declared = parcel.declaredValue.trim() ? Number(parcel.declaredValue) : null;
      const response = await neonApi.createShipment({
        senderName: sender.name.trim(),
        senderPhone: sender.phone.trim(),
        senderEmail: user?.email ?? undefined,
        senderAddress: sender.address.trim(),
        senderCity: sender.state.trim(),
        senderState: sender.state.trim(),
        senderCountry: sender.country,
        senderPostalCode: sender.postalCode.trim(),
        recipientName: recipient.name.trim(),
        recipientPhone: recipient.phone.trim(),
        recipientEmail: recipient.email.trim() || undefined,
        recipientAddress: recipient.address.trim(),
        recipientCity: recipient.state.trim(),
        recipientState: recipient.state.trim(),
        recipientCountry: recipient.country,
        recipientPostalCode: recipient.postalCode.trim(),
        packageDescription: parcel.description.trim(),
        weight: Number(parcel.weight),
        dimensions: `${parcel.length} × ${parcel.width} × ${parcel.height} cm`,
        serviceType: parcel.type,
        notes: declared !== null ? `Declared value: ₦${declared.toLocaleString("en-NG")}` : undefined,
      });

      const shipmentId = String(response.id ?? response._id ?? "");
      const trackingNumber = String(response.trackingNumber ?? response.tracking_number ?? "");

      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        /* Nothing to clean up if storage is unavailable. */
      }
      notifyNeonQueries();
      toast.success("Shipment created", {
        description: trackingNumber
          ? `Tracking ${trackingNumber} is live. ${costPoints} point${costPoints === 1 ? "" : "s"} charged.`
          : `${costPoints} point${costPoints === 1 ? "" : "s"} charged.`,
      });
      navigate(shipmentId ? `/shipments/${shipmentId}` : "/shipments");
    } catch (error) {
      // Keep every field as entered so the user can retry without retyping.
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't create this shipment. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const motionProps = reduced
    ? {}
    : {
        initial: { opacity: 0, x: 14 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -14 },
        transition: { duration: 0.22, ease: EASE_OUT_QUINT },
      };

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4">
      {/* Title */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-0.5 size-9 shrink-0" asChild>
          <Link to="/shipments" aria-label="Back to shipments">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">New shipment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Four steps: sender, recipient, parcel, review.
          </p>
        </div>
      </div>

      <Card className="p-0 py-0">
        {/* Step indicator */}
        <div className="border-b border-border px-3 py-3 sm:px-5">
          <ol className="flex items-center gap-1 sm:gap-2">
            {STEPS.map((item, index) => {
              const done = step > item.number;
              const active = step === item.number;
              return (
                <li key={item.number} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.number < step) setStep(item.number);
                    }}
                    disabled={item.number >= step}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex min-h-9 min-w-0 items-center gap-1.5 rounded-full px-1 py-1 text-left transition-colors duration-200 sm:px-2",
                      active && "bg-primary/10",
                      item.number < step && "hover:bg-muted",
                      item.number >= step && "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : done
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {done ? <Check className="size-3.5" /> : item.number}
                    </span>
                    <span
                      className={cn(
                        "truncate text-[11px] sm:text-xs",
                        active
                          ? "font-bold text-primary"
                          : done
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className={cn("h-px min-w-2 flex-1", done ? "bg-primary/40" : "bg-border")}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Step body */}
        <div className="px-4 py-5 sm:px-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} {...motionProps}>
              {step === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="sender-name" label="Sender name" error={visibleErrors["sender.name"]}>
                    <Input
                      id="sender-name"
                      autoComplete="name"
                      value={sender.name}
                      placeholder="Ada Lopez"
                      onChange={(event) => updateParty("sender")("name")(event.target.value)}
                      {...touchedAttrs("sender.name")}
                    />
                  </Field>
                  <Field id="sender-phone" label="Phone" error={visibleErrors["sender.phone"]}>
                    <Input
                      id="sender-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={sender.phone}
                      placeholder="+234 801 234 5678"
                      onChange={(event) => updateParty("sender")("phone")(event.target.value)}
                      {...touchedAttrs("sender.phone")}
                    />
                  </Field>
                  <Field
                    id="sender-address"
                    label="Address line"
                    error={visibleErrors["sender.address"]}
                    className="sm:col-span-2"
                  >
                    <Input
                      id="sender-address"
                      autoComplete="street-address"
                      value={sender.address}
                      placeholder="12 Marina Road"
                      onChange={(event) => updateParty("sender")("address")(event.target.value)}
                      {...touchedAttrs("sender.address")}
                    />
                  </Field>
                  <Field id="sender-country" label="Country" error={visibleErrors["sender.country"]}>
                    <Select
                      value={sender.country}
                      onValueChange={(value) => {
                        updateParty("sender")("country")(value);
                        setTouched((current) => ({ ...current, "sender.country": true }));
                      }}
                    >
                      <SelectTrigger id="sender-country" {...touchedAttrs("sender.country")}>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="sender-state" label="State / region" error={visibleErrors["sender.state"]}>
                    <StateField
                      id="sender-state"
                      country={sender.country}
                      value={sender.state}
                      onChange={(value) => updateParty("sender")("state")(value)}
                      attrs={touchedAttrs("sender.state")}
                    />
                  </Field>
                  <Field
                    id="sender-postal"
                    label="Postal code"
                    error={visibleErrors["sender.postalCode"]}
                  >
                    <Input
                      id="sender-postal"
                      autoComplete="postal-code"
                      value={sender.postalCode}
                      placeholder="100001"
                      onChange={(event) => updateParty("sender")("postalCode")(event.target.value)}
                      {...touchedAttrs("sender.postalCode")}
                    />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="recipient-name" label="Recipient name" error={visibleErrors["recipient.name"]}>
                    <Input
                      id="recipient-name"
                      autoComplete="name"
                      value={recipient.name}
                      placeholder="Daniel Okafor"
                      onChange={(event) => updateParty("recipient")("name")(event.target.value)}
                      {...touchedAttrs("recipient.name")}
                    />
                  </Field>
                  <Field id="recipient-phone" label="Phone" error={visibleErrors["recipient.phone"]}>
                    <Input
                      id="recipient-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={recipient.phone}
                      placeholder="+234 802 345 6789"
                      onChange={(event) => updateParty("recipient")("phone")(event.target.value)}
                      {...touchedAttrs("recipient.phone")}
                    />
                  </Field>
                  <Field
                    id="recipient-address"
                    label="Address line"
                    error={visibleErrors["recipient.address"]}
                    className="sm:col-span-2"
                  >
                    <Input
                      id="recipient-address"
                      autoComplete="street-address"
                      value={recipient.address}
                      placeholder="4 Ahmadu Bello Way"
                      onChange={(event) => updateParty("recipient")("address")(event.target.value)}
                      {...touchedAttrs("recipient.address")}
                    />
                  </Field>
                  <Field id="recipient-country" label="Country" error={visibleErrors["recipient.country"]}>
                    <Select
                      value={recipient.country}
                      onValueChange={(value) => {
                        updateParty("recipient")("country")(value);
                        setTouched((current) => ({ ...current, "recipient.country": true }));
                      }}
                    >
                      <SelectTrigger id="recipient-country" {...touchedAttrs("recipient.country")}>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="recipient-state" label="State / region" error={visibleErrors["recipient.state"]}>
                    <StateField
                      id="recipient-state"
                      country={recipient.country}
                      value={recipient.state}
                      onChange={(value) => updateParty("recipient")("state")(value)}
                      attrs={touchedAttrs("recipient.state")}
                    />
                  </Field>
                  <Field
                    id="recipient-postal"
                    label="Postal code"
                    error={visibleErrors["recipient.postalCode"]}
                  >
                    <Input
                      id="recipient-postal"
                      autoComplete="postal-code"
                      value={recipient.postalCode}
                      placeholder="900001"
                      onChange={(event) => updateParty("recipient")("postalCode")(event.target.value)}
                      {...touchedAttrs("recipient.postalCode")}
                    />
                  </Field>
                  <Field
                    id="recipient-email"
                    label="Email for notifications"
                    required={false}
                    error={visibleErrors["recipient.email"]}
                    hint="We'll send tracking updates here once the parcel moves."
                    className="sm:col-span-2"
                  >
                    <Input
                      id="recipient-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={recipient.email}
                      placeholder="daniel@example.com"
                      onChange={(event) => updateParty("recipient")("email")(event.target.value)}
                      {...touchedAttrs("recipient.email")}
                    />
                  </Field>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-foreground">Shipment type</p>
                    <div
                      role="radiogroup"
                      aria-label="Shipment type"
                      className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2/60 p-1"
                    >
                      {[
                        { value: "parcel" as const, label: "Parcel", hint: "Up to 500 kg", icon: Package },
                        { value: "freight" as const, label: "Freight", hint: "Pallets & bulk", icon: Truck },
                      ].map((option) => {
                        const active = parcel.type === option.value;
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              setDirty(true);
                              setParcel((current) => ({ ...current, type: option.value }));
                            }}
                            className={cn(
                              "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200",
                              active
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <Icon className="size-4" aria-hidden />
                            <span>{option.label}</span>
                            <span
                              className={cn(
                                "hidden text-[10px] font-normal sm:inline",
                                active ? "text-primary-foreground/80" : "text-muted-foreground",
                              )}
                            >
                              {option.hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id="parcel-weight"
                      label="Weight (kg)"
                      error={visibleErrors["parcel.weight"]}
                    >
                      <Input
                        id="parcel-weight"
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        step="0.1"
                        value={parcel.weight}
                        placeholder="2.5"
                        onChange={(event) => updateParcel("weight")(event.target.value)}
                        {...touchedAttrs("parcel.weight")}
                      />
                    </Field>
                    <Field
                      id="parcel-value"
                      label="Declared value (₦)"
                      required={false}
                      error={visibleErrors["parcel.declaredValue"]}
                      hint="Used for carrier liability, never charged."
                    >
                      <Input
                        id="parcel-value"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={parcel.declaredValue}
                        placeholder="25000"
                        onChange={(event) => updateParcel("declaredValue")(event.target.value)}
                        {...touchedAttrs("parcel.declaredValue")}
                      />
                    </Field>
                  </div>

                  <fieldset className="space-y-1.5">
                    <legend className="text-xs font-medium text-foreground">
                      Dimensions (cm)<span className="text-destructive" aria-hidden> *</span>
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "length" as const, label: "L" },
                        { key: "width" as const, label: "W" },
                        { key: "height" as const, label: "H" },
                      ].map((dimension) => (
                        <div key={dimension.key} className="space-y-1">
                          <Input
                            id={`parcel-${dimension.key}`}
                            aria-label={`${dimension.key} in cm`}
                            type="number"
                            inputMode="decimal"
                            min="1"
                            value={parcel[dimension.key]}
                            placeholder={dimension.label}
                            onChange={(event) => updateParcel(dimension.key)(event.target.value)}
                            {...touchedAttrs(`parcel.${dimension.key}`)}
                          />
                          {visibleErrors[`parcel.${dimension.key}`] ? (
                            <p
                              id={`parcel-${dimension.key}-error`}
                              role="alert"
                              className="text-[11px] text-destructive"
                            >
                              {visibleErrors[`parcel.${dimension.key}`]}
                            </p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">{dimension.label}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  <Field
                    id="parcel-description"
                    label="Description"
                    error={visibleErrors["parcel.description"]}
                    hint="Visible on the label and the public tracking page."
                  >
                    <Textarea
                      id="parcel-description"
                      rows={3}
                      value={parcel.description}
                      placeholder="Two cartons of printed brochures, handle with care."
                      onChange={(event) => updateParcel("description")(event.target.value)}
                      {...touchedAttrs("parcel.description")}
                    />
                  </Field>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <SummaryBlock
                    title="Sender"
                    rows={[
                      { label: "Name", value: sender.name },
                      { label: "Phone", value: sender.phone },
                      { label: "Address", value: sender.address },
                      { label: "Country", value: sender.country },
                      { label: "State / region", value: sender.state },
                      { label: "Postal code", value: sender.postalCode },
                    ]}
                  />
                  <SummaryBlock
                    title="Recipient"
                    rows={[
                      { label: "Name", value: recipient.name },
                      { label: "Phone", value: recipient.phone },
                      { label: "Address", value: recipient.address },
                      { label: "Country", value: recipient.country },
                      { label: "State / region", value: recipient.state },
                      { label: "Postal code", value: recipient.postalCode },
                      { label: "Email", value: recipient.email || "Not provided" },
                    ]}
                  />
                  <SummaryBlock
                    title="Parcel"
                    rows={[
                      { label: "Type", value: parcel.type === "freight" ? "Freight" : "Parcel" },
                      { label: "Weight", value: `${parcel.weight} kg` },
                      {
                        label: "Dimensions",
                        value: `${parcel.length} × ${parcel.width} × ${parcel.height} cm`,
                      },
                      {
                        label: "Declared value",
                        value: parcel.declaredValue
                          ? `₦${Number(parcel.declaredValue).toLocaleString("en-NG")}`
                          : "Not declared",
                      },
                      { label: "Description", value: parcel.description },
                    ]}
                  />

                  {/* Cost panel */}
                  <div className="rounded-2xl border border-border bg-surface-2/60 p-4">
                    {pointsBalance === undefined ? (
                      <div className="space-y-2" role="status" aria-label="Checking points balance">
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-foreground">
                          Creating this shipment costs{" "}
                          <span className="font-semibold">
                            {costPoints} point{costPoints === 1 ? "" : "s"}
                          </span>
                          . Balance after:{" "}
                          <span className="font-mono font-semibold tabular-nums">
                            {balanceAfter?.toLocaleString()}
                          </span>
                          .
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Current balance {pointsBalance.toLocaleString()} points
                          {ngnPerPoint > 0 ? ` · ${ngnPerPoint} NGN per point` : ""}
                        </p>
                        {!canAfford && (
                          <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <p>
                              You need {(costPoints - pointsBalance).toLocaleString()} more point
                              {costPoints - pointsBalance === 1 ? "" : "s"} to create this shipment.{" "}
                              <Link to="/buy-points" className="font-semibold underline underline-offset-2">
                                Top up
                              </Link>
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Check the details above. Shipments create a live tracking number as soon as you
                    confirm, and this can&apos;t be undone from this screen.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Card>

      {/* Sticky footer — a sibling of the card so it can stick to the scrollport; */}
      {/* an ancestor with `overflow: hidden` would silently break `sticky`. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-border bg-card/95 px-3 py-3 backdrop-blur-xl sm:px-5 lg:bottom-0">
          {submitError && (
            <div
              role="alert"
              className="mb-2.5 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
            >
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{submitError}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <p className="order-3 w-full text-[11px] text-muted-foreground sm:order-1 sm:w-auto sm:flex-1">
              {savedLabel}
            </p>
            {step < 4 ? (
              <div className="order-1 flex w-full items-center gap-2 sm:order-2 sm:ml-auto sm:w-auto">
                <Button variant="outline" onClick={goBack} className="flex-1 gap-1.5 sm:flex-none">
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button onClick={goNext} className="flex-1 gap-1.5 sm:flex-none">
                  Next <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="order-1 flex w-full items-center gap-2 sm:order-2 sm:ml-auto sm:w-auto">
                <Button variant="outline" onClick={saveDraft} className="flex-1 gap-1.5 sm:flex-none">
                  <Save className="size-4" /> Save draft
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={submitting || !canAfford || pointsBalance === undefined}
                  className="flex-1 gap-1.5 sm:flex-none"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Creating…
                    </>
                  ) : (
                    <>
                      Create shipment (−{costPoints} pt)
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────── */

function StateField({
  id,
  country,
  value,
  onChange,
  attrs,
}: {
  id: string;
  country: string;
  value: string;
  onChange: (value: string) => void;
  attrs: FieldAttrs;
}) {
  const regions = STATES_BY_COUNTRY[country];

  if (!regions) {
    return (
      <Input
        id={id}
        value={value}
        placeholder="State / region"
        onChange={(event) => onChange(event.target.value)}
        {...attrs}
      />
    );
  }

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} {...attrs}>
        <SelectValue placeholder="Select state" />
      </SelectTrigger>
      <SelectContent>
        {regions.map((region) => (
          <SelectItem key={region} value={region}>
            {region}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SummaryBlock({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <section>
      <h2 className="section-label text-primary">{title}</h2>
      <dl className="mt-2 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-foreground">{row.value?.trim() || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
