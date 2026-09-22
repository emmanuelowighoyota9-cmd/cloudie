import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePricing } from "@/lib/pricing";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Coins,
  Save,
  MessageSquarePlus,
  Send,
  Weight,
  Ruler,
  FileText,
  User,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { Link, useParams, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { statusBadgeClass, statusLabel } from "@/lib/trackingUi";

const UPDATE_COST = 25;
const EVENT_COST = 15;

export default function ShipmentUpdateForm() {
  const { price } = usePricing();
  const updatePrice = price("shipment_tracking_update", UPDATE_COST);
  const eventPrice = price("shipment_event_add", EVENT_COST);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const detail = useQuery(
    api.trackingUser.myShipmentDetail,
    id ? { id: id as Id<"trackingShipments"> } : "skip",
  );
  const balance = useQuery(api.trackingUser.myPointsBalance);

  const updateShipment = useMutation(api.trackingUser.customerUpdateShipment);
  const addEvent = useMutation(api.trackingUser.customerAddShipmentEvent);

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Editable fields
  const [packageDescription, setPackageDescription] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [notes, setNotes] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [recipientState, setRecipientState] = useState("");
  const [recipientCountry, setRecipientCountry] = useState("");
  const [recipientPostalCode, setRecipientPostalCode] = useState("");

  // Event fields
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");

  // Initialize fields from shipment data
  useEffect(() => {
    if (detail?.shipment) {
      const s = detail.shipment;
      setPackageDescription(s.packageDescription ?? "");
      setTotalWeight(String(s.totalWeight ?? ""));
      setDimensions(s.dimensions ?? "");
      setNotes("");
    }
  }, [detail?.shipment?._id]);

  if (detail === undefined) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-16 text-center">
        <Package className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 text-sm text-muted-foreground">Shipment not found or not yours.</p>
        <Link to="/shipments">
          <Button variant="ghost" className="mt-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
      </div>
    );
  }

  const s = detail.shipment;
  const canUpdate = s.role === "sender" && s.status !== "DELIVERED" && s.status !== "CANCELLED";
  const canAddEvent = s.status !== "DELIVERED" && s.status !== "CANCELLED";
  const currentBalance = balance?.balance ?? 0;

  const handleUpdateDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await updateShipment({
        shipmentId: id as Id<"trackingShipments">,
        packageDescription: packageDescription || undefined,
        totalWeight: totalWeight ? parseFloat(totalWeight) : undefined,
        dimensions: dimensions || undefined,
        notes: notes || undefined,
        recipientName: recipientName || undefined,
        recipientPhone: recipientPhone || undefined,
        recipientEmail: recipientEmail || undefined,
        recipientAddress: recipientAddress || undefined,
        recipientCity: recipientCity || undefined,
        recipientState: recipientState || undefined,
        recipientCountry: recipientCountry || undefined,
        recipientPostalCode: recipientPostalCode || undefined,
      });
      toast.success("Shipment updated!", {
        description: `${result.pointsCost} points deducted. Changes: ${result.changes.length > 0 ? result.changes.join(", ") : "details updated"}`,
      });
      setNotes("");
      navigate(`/shipments/${id}/updates`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update shipment");
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDescription.trim()) {
      toast.error("Both title and description are required");
      return;
    }
    setLoading(true);
    try {
      const result = await addEvent({
        shipmentId: id as Id<"trackingShipments">,
        title: eventTitle.trim(),
        description: eventDescription.trim(),
      });
      toast.success("Event added!", {
        description: `${result.pointsCost} points deducted. New balance: ${result.newBalance}`,
      });
      setEventTitle("");
      setEventDescription("");
      navigate(`/shipments/${id}/updates`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-4"
      >
        <Link to={`/shipments/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">
              {s.trackingNumber}
            </h1>
            <Badge className={`border-0 px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(s.status)}`}>
              {statusLabel(s.status)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Update shipment details or add events · Points: {currentBalance}
          </p>
        </div>
      </motion.div>

      {/* Points Balance Warning */}
      {currentBalance < updatePrice.points && currentBalance < eventPrice.points && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Insufficient points</p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80">
                  You need at least {updatePrice.points} points to update details or {eventPrice.points} points to add an event.
                </p>
              </div>
              <Link to="/buy-points" className="ml-auto">
                <Button size="sm" className="gap-1.5">
                  <Coins className="h-3.5 w-3.5" /> Buy Points
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Cost Info Cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Card className="border-border">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Pencil className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Update Details</p>
              <p className="text-xs text-muted-foreground">{updatePrice.label} per update</p>
            </div>
            <Badge variant="outline" className="ml-auto text-[10px]">
              <Coins className="h-3 w-3 mr-1" />{updatePrice.points}
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Add Event / Note</p>
              <p className="text-xs text-muted-foreground">{eventPrice.label} per event</p>
            </div>
            <Badge variant="outline" className="ml-auto text-[10px]">
              <Coins className="h-3 w-3 mr-1" />{eventPrice.points}
            </Badge>
          </CardContent>
        </Card>
      </motion.div>

      {/* Terminal Status Warning */}
      {(s.status === "DELIVERED" || s.status === "CANCELLED") && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              This shipment is <strong>{statusLabel(s.status)}</strong> and cannot be updated.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1 gap-2">
              <Pencil className="h-4 w-4" /> Update Details
            </TabsTrigger>
            <TabsTrigger value="event" className="flex-1 gap-2">
              <MessageSquarePlus className="h-4 w-4" /> Add Event
            </TabsTrigger>
          </TabsList>

          {/* Update Details Tab */}
          <TabsContent value="details">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Shipment Details
                </CardTitle>
                <CardDescription>
                  Edit package and recipient information. Changes cost {updatePrice.points} points.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleUpdateDetails}>
                <CardContent className="space-y-6">
                  {/* Package Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Package className="h-3.5 w-3.5" /> Package Information
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5" /> Package Description
                        </Label>
                        <Input
                          value={packageDescription}
                          onChange={(e) => setPackageDescription(e.target.value)}
                          placeholder="What's in the package?"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Weight className="h-3.5 w-3.5" /> Weight (kg)
                        </Label>
                        <Input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={totalWeight}
                          onChange={(e) => setTotalWeight(e.target.value)}
                          placeholder={String(s.totalWeight)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Ruler className="h-3.5 w-3.5" /> Dimensions
                        </Label>
                        <Input
                          value={dimensions}
                          onChange={(e) => setDimensions(e.target.value)}
                          placeholder="L×W×H cm"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Internal Notes</Label>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Any notes about this update..."
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recipient Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <User className="h-3.5 w-3.5" /> Recipient Information
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" /> Name
                        </Label>
                        <Input
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder={s.recipientName}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" /> Phone
                        </Label>
                        <Input
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          placeholder="Recipient phone"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> Email
                        </Label>
                        <Input
                          type="email"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          placeholder="Recipient email"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> Address
                        </Label>
                        <Input
                          value={recipientAddress}
                          onChange={(e) => setRecipientAddress(e.target.value)}
                          placeholder="Street address"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>City</Label>
                        <Input
                          value={recipientCity}
                          onChange={(e) => setRecipientCity(e.target.value)}
                          placeholder={s.recipientCity}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>State / Region</Label>
                        <Input
                          value={recipientState}
                          onChange={(e) => setRecipientState(e.target.value)}
                          placeholder="State or region"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Country</Label>
                        <Input
                          value={recipientCountry}
                          onChange={(e) => setRecipientCountry(e.target.value)}
                          placeholder={s.recipientCountry}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Postal Code</Label>
                        <Input
                          value={recipientPostalCode}
                          onChange={(e) => setRecipientPostalCode(e.target.value)}
                          placeholder="Postal code"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="flex items-center justify-between border-t border-border px-6 py-4">
                  <p className="text-xs text-muted-foreground">
                    Cost: <strong className="text-foreground">{updatePrice.points} points ({updatePrice.ngnLabel})</strong>
                  </p>
                  <Button
                    type="submit"
                    disabled={loading || !canUpdate || currentBalance < UPDATE_COST}
                    className="gap-2"
                  >
                    {loading ? (
                      "Updating..."
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Update Shipment
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </TabsContent>

          {/* Add Event Tab */}
          <TabsContent value="event">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Add Tracking Event
                </CardTitle>
                <CardDescription>
                  Add a note or event to the shipment timeline. Costs {EVENT_COST} points.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleAddEvent}>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Event Title *</Label>
                    <Input
                      required
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="e.g. Package handed to courier"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description *</Label>
                    <Textarea
                      required
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      placeholder="Describe what happened..."
                      rows={3}
                    />
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">
                      This event will be visible on the public tracking page and added to the shipment timeline.
                    </p>
                  </div>
                </CardContent>
                <div className="flex items-center justify-between border-t border-border px-6 py-4">
                  <p className="text-xs text-muted-foreground">
                    Cost: <strong className="text-foreground">{EVENT_COST} points</strong>
                  </p>
                  <Button
                    type="submit"
                    disabled={loading || !canAddEvent || currentBalance < EVENT_COST}
                    className="gap-2"
                  >
                    {loading ? (
                      "Adding..."
                    ) : (
                      <>
                        <Send className="h-4 w-4" /> Add Event
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
