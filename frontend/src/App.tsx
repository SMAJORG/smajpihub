import SiteContentLoader from "./components/SiteContentLoader";
import NativeAdsController from "./components/NativeAdsController";
import NativeUpdatePrompt from "./components/NativeUpdatePrompt";
import { useLayoutEffect } from "react";
import { RouterProvider } from "react-router-dom";
import router from "./Router.tsx";
import AuthToast from "./components/AuthToast";
import GlobalFeedbackCenter from "./components/GlobalFeedbackCenter";
import useSliceReveal from "./hooks/useSliceReveal";
import { FoodCartProvider } from "./contexts/FoodCartContext";
import { HealthBookingProvider } from "./contexts/HealthBookingContext";
import PiBrowserHandoff from "./components/PiBrowserHandoff";
import NativeWelcomeGate from "./components/NativeWelcomeGate";
import NativeRuntimeBridge from "./components/NativeRuntimeBridge";
import OfflineStatus from "./components/OfflineStatus";
import NativeAppLockGate from "./components/NativeAppLockGate";

function App() {
  useSliceReveal();
  const isAdminRoute = /(^|\/)admin(?:\/|$)/.test(window.location.pathname);

  useLayoutEffect(() => {
    document.body.classList.toggle("desktop-admin-route", isAdminRoute);
    return () => document.body.classList.remove("desktop-admin-route");
  }, [isAdminRoute]);

  return (
    <>
      <OfflineStatus />
      <SiteContentLoader />
      <NativeWelcomeGate>
        <NativeAppLockGate>
        <NativeRuntimeBridge />
        <NativeAdsController />
        <NativeUpdatePrompt />
        <div className={"mobile-tablet-app" + (isAdminRoute ? " desktop-admin-app" : "")}>
          <FoodCartProvider>
            <HealthBookingProvider>
              <RouterProvider router={router} />
            </HealthBookingProvider>
          </FoodCartProvider>
          <AuthToast />
          <GlobalFeedbackCenter />
        </div>
        <PiBrowserHandoff />
        </NativeAppLockGate>
      </NativeWelcomeGate>
    </>
  );
}

export default App;
