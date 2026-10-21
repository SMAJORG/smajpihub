import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "../src/contexts/AuthContext";
import CareRouteHomePage from "../src/pages/careroute/CareRouteHomePage";
import CareRouteTrackPage from "../src/pages/careroute/CareRouteTrackPage";
import CareRouteMyRequestsPage from "../src/pages/careroute/CareRouteMyRequestsPage";
import CareRouteHospitalDashboard from "../src/pages/careroute/CareRouteHospitalDashboard";
import "../src/i18n";
import "../src/index.css";

const router = createBrowserRouter([
  { path: "/tests/careroute.html", element: <CareRouteHomePage /> },
  { path: "/careroute", element: <CareRouteHomePage /> },
  { path: "/careroute/track/:requestId?", element: <CareRouteTrackPage /> },
  { path: "/careroute/my-requests", element: <CareRouteMyRequestsPage /> },
  { path: "/careroute/hospital-dashboard", element: <CareRouteHospitalDashboard /> },
]);
// Mount real pages under the hub's CSS scope without unrelated startup flows.
createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <div className="private-shell" style={{ display: "block", width: "100%", minHeight: "100vh" }}>
      <RouterProvider router={router} />
    </div>
  </AuthProvider>
);
