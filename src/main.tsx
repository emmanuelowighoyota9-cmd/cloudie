import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireAdmin } from "@/components/RequireAdmin";
import { ThemeProvider } from "@/components/ThemeProvider";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy-loaded pages
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const AdminLogin = lazy(() => import("./pages/AdminLogin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Personal = lazy(() => import("./pages/Personal.tsx"));
const Wallet = lazy(() => import("./pages/Wallet.tsx"));
const Shipments = lazy(() => import("./pages/Shipments.tsx"));
const NewShipment = lazy(() => import("./pages/NewShipment.tsx"));
const ShipmentDetail = lazy(() => import("./pages/ShipmentDetail.tsx"));
const PublicTracking = lazy(() => import("./pages/PublicTracking.tsx"));
const SiteLanding = lazy(() => import("./pages/site/SiteLanding.tsx"));
const SiteBanking = lazy(() => import("./pages/site/SiteBanking.tsx"));
const SiteAuth = lazy(() => import("./pages/site/SiteAuth.tsx"));
const SiteDashboard = lazy(() => import("./pages/site/SiteDashboard.tsx"));
const SiteAccounts = lazy(() => import("./pages/site/SiteAccounts.tsx"));
const SiteTransactions = lazy(() => import("./pages/site/SiteTransactions.tsx"));
const SiteKyc = lazy(() => import("./pages/site/SiteKyc.tsx"));
const SiteAdmin = lazy(() => import("./pages/site/SiteAdmin.tsx"));
const AdminBankingTenants = lazy(() => import("./pages/AdminBankingTenants.tsx"));
const AdminBankingCreateTenant = lazy(() => import("./pages/AdminBankingCreateTenant.tsx"));
const AdminBankingTenantDetail = lazy(() => import("./pages/AdminBankingTenantDetail.tsx"));
const AdminBankingTenantSettings = lazy(() => import("./pages/AdminBankingTenantSettings.tsx"));
const Ticketing = lazy(() => import("./pages/Ticketing.tsx"));
const FlightDocument = lazy(() => import("./pages/FlightDocument.tsx"));
const HotelDocument = lazy(() => import("./pages/HotelDocument.tsx"));
const InvoiceDocument = lazy(() => import("./pages/InvoiceDocument.tsx"));
const CustomsDocument = lazy(() => import("./pages/CustomsDocument.tsx"));
const BusinessSuite = lazy(() => import("./pages/BusinessSuite.tsx"));
const NewSite = lazy(() => import("./pages/NewSite.tsx"));
const SiteDetail = lazy(() => import("./pages/SiteDetail.tsx"));
const Services = lazy(() => import("./pages/Services.tsx"));
const EmailCampaign = lazy(() => import("./pages/EmailCampaign.tsx"));
const RenderStudio = lazy(() => import("./pages/RenderStudio.tsx"));
const AssetsPage = lazy(() => import("./pages/Assets.tsx"));
const MarketplacePage = lazy(() => import("./pages/Marketplace.tsx"));
const Referrals = lazy(() => import("./pages/Referrals.tsx"));
const NotificationsPage = lazy(() => import("./pages/Notifications.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const BuyPoints = lazy(() => import("./pages/BuyPoints.tsx"));
const Orders = lazy(() => import("./pages/Orders.tsx"));
const Vendor = lazy(() => import("./pages/Vendor.tsx"));
const Transactions = lazy(() => import("./pages/Transactions.tsx"));
const AppLayout = lazy(() => import("./components/AppLayout.tsx").then(m => ({ default: m.AppLayout })));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminUsers = lazy(() => import("./pages/AdminUsers.tsx"));
const AdminUserDetail = lazy(() => import("./pages/AdminUserDetail.tsx"));
const AdminVendors = lazy(() => import("./pages/AdminVendors.tsx"));
const AdminVendorDetail = lazy(() => import("./pages/AdminVendorDetail.tsx"));
const AdminTenants = lazy(() => import("./pages/AdminTenants.tsx"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics.tsx"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs.tsx"));
const AdminMarketplace = lazy(() => import("./pages/AdminMarketplace.tsx"));
const AdminOrders = lazy(() => import("./pages/AdminOrders.tsx"));
const AdminDisputes = lazy(() => import("./pages/AdminDisputes.tsx"));
const AdminShipments = lazy(() => import("./pages/AdminShipments.tsx"));
const AdminCreateShipment = lazy(() => import("./pages/AdminCreateShipment.tsx"));
const AdminShipmentDetail = lazy(() => import("./pages/AdminShipmentDetail.tsx"));
const AdminLocations = lazy(() => import("./pages/AdminLocations.tsx"));
const AdminDocuments = lazy(() => import("./pages/AdminDocuments.tsx"));
const AdminTransactions = lazy(() => import("./pages/AdminTransactions.tsx"));
const AdminKYC = lazy(() => import("./pages/AdminKYC.tsx"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications.tsx"));
const AdminInfrastructure = lazy(() => import("./pages/AdminInfrastructure.tsx"));
const AdminPricing = lazy(() => import("./pages/AdminPricing.tsx"));
const AdminSettings = lazy(() => import("./pages/AdminSettings.tsx"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout.tsx").then(m => ({ default: m.AdminLayout })));

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn("[VlyToolbar] Caught error:", err.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Unknown error" };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Register the Cloudie service worker (offline fallback + static asset caching).
// Production only: in development the managed dev server serves assets directly
// and a service worker would risk serving stale bundles to the preview.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage({ type: "iframe-route-change", path: location.pathname }, "*");
  }, [location.pathname]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <ThemeProvider>
          <BrowserRouter>
            <RouteSyncer />
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/track/:trackingNumber" element={<PublicTracking />} />
                <Route path="/tracking" element={<PublicTracking />} />
                <Route path="/tracking/:trackingNumber" element={<PublicTracking />} />

                {/* Generated tenant banking site (public) — canonical = /site/:siteId/banking (full portal) */}
                <Route path="/site/:siteId" element={<React.Suspense fallback={<RouteLoading />}><SiteLanding /></React.Suspense>} />
                <Route path="/site/:siteId/banking" element={<React.Suspense fallback={<RouteLoading />}><SiteBanking /></React.Suspense>} />
                <Route path="/site/:siteId/about" element={<React.Suspense fallback={<RouteLoading />}><SiteLanding /></React.Suspense>} />
                <Route path="/site/:siteId/services" element={<React.Suspense fallback={<RouteLoading />}><SiteLanding /></React.Suspense>} />
                <Route path="/site/:siteId/contact" element={<React.Suspense fallback={<RouteLoading />}><SiteLanding /></React.Suspense>} />
                <Route path="/site/:siteId/login" element={<React.Suspense fallback={<RouteLoading />}><SiteAuth /></React.Suspense>} />
                <Route path="/site/:siteId/signup" element={<React.Suspense fallback={<RouteLoading />}><SiteAuth /></React.Suspense>} />
                <Route path="/site/:siteId/dashboard" element={<React.Suspense fallback={<RouteLoading />}><SiteDashboard /></React.Suspense>} />
                <Route path="/site/:siteId/accounts" element={<React.Suspense fallback={<RouteLoading />}><SiteAccounts /></React.Suspense>} />
                <Route path="/site/:siteId/transactions" element={<React.Suspense fallback={<RouteLoading />}><SiteTransactions /></React.Suspense>} />
                <Route path="/site/:siteId/kyc" element={<React.Suspense fallback={<RouteLoading />}><SiteKyc /></React.Suspense>} />
                <Route path="/site/:siteId/notifications" element={<React.Suspense fallback={<RouteLoading />}><SiteDashboard /></React.Suspense>} />
                <Route path="/site/:siteId/admin" element={<React.Suspense fallback={<RouteLoading />}><SiteAdmin /></React.Suspense>} />
                <Route path="/:tenant/banking" element={<React.Suspense fallback={<RouteLoading />}><SiteBanking /></React.Suspense>} />

                {/* Authenticated app routes with layout */}
                <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/personal" element={<Personal />} />
                  <Route path="/personal/wallet" element={<Wallet />} />
                  <Route path="/personal/transactions" element={<Wallet />} />
                  <Route path="/shipments" element={<Shipments />} />
                  <Route path="/shipments/new" element={<NewShipment />} />
                  <Route path="/shipments/:id" element={<ShipmentDetail />} />
                  <Route path="/ticketing" element={<Ticketing />} />
                  <Route path="/ticketing/flight" element={<FlightDocument />} />
                  <Route path="/ticketing/hotel" element={<HotelDocument />} />
                  <Route path="/ticketing/invoice" element={<InvoiceDocument />} />
                  <Route path="/ticketing/customs" element={<CustomsDocument />} />
                  <Route path="/business" element={<BusinessSuite />} />
                  <Route path="/business/sites" element={<BusinessSuite />} />
                  <Route path="/business/sites/new" element={<NewSite />} />
                  <Route path="/business/sites/:siteId" element={<SiteDetail />} />
                  <Route path="/services" element={<Services />} />
                  <Route path="/services/email" element={<EmailCampaign />} />
                  <Route path="/services/render" element={<RenderStudio />} />
                  <Route path="/services/assets" element={<AssetsPage />} />
                  <Route path="/marketplace" element={<MarketplacePage />} />
                  <Route path="/marketplace/orders" element={<MarketplacePage />} />
                  <Route path="/referrals" element={<Referrals />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/buy-points" element={<BuyPoints />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/vendor" element={<Vendor />} />
                  <Route path="/transactions" element={<Transactions />} />

                </Route>

                {/* Admin routes — server-side authorization re-verified in every admin Convex function */}
                <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                  <Route index element={<Admin />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="users/:userId" element={<AdminUserDetail />} />
                  <Route path="vendors" element={<AdminVendors />} />
                  <Route path="vendors/:vendorId" element={<AdminVendorDetail />} />
                  <Route path="marketplace" element={<AdminMarketplace />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="disputes" element={<AdminDisputes />} />
                  <Route path="transactions" element={<AdminTransactions />} />
                  <Route path="shipments" element={<AdminShipments />} />
                  <Route path="shipments/create" element={<AdminCreateShipment />} />
                  <Route path="shipments/:shipmentId" element={<AdminShipmentDetail />} />
                  <Route path="locations" element={<AdminLocations tab="locations" />} />
                  <Route path="facilities" element={<AdminLocations tab="facilities" />} />
                  <Route path="documents" element={<AdminDocuments />} />
                  <Route path="tenants" element={<AdminTenants />} />
                  <Route path="tenants/new" element={<AdminBankingCreateTenant />} />
                  <Route path="tenants/banking" element={<AdminBankingTenants />} />
                  <Route path="tenants/:tenantId/banking" element={<AdminBankingTenantDetail />} />
                  <Route path="tenants/:tenantId/banking/settings" element={<AdminBankingTenantSettings />} />
                  <Route path="kyc" element={<AdminKYC />} />
                  <Route path="notifications" element={<AdminNotifications />} />
                  <Route path="audit" element={<AdminAuditLogs />} />
                  <Route path="audit-logs" element={<AdminAuditLogs />} />
                  <Route path="analytics" element={<AdminAnalytics />} />
                  <Route path="system-health" element={<AdminInfrastructure />} />
                  <Route path="infrastructure" element={<AdminInfrastructure />} />
                  <Route path="pricing" element={<AdminPricing />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </ThemeProvider>
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
