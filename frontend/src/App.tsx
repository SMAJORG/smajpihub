import { useLayoutEffect } from "react";
import { RouterProvider } from "react-router-dom";
import router from "./Router.tsx";
import AuthToast from "./components/AuthToast";
import GlobalFeedbackCenter from "./components/GlobalFeedbackCenter";
import useSliceReveal from "./hooks/useSliceReveal";
import { FoodCartProvider } from "./contexts/FoodCartContext";
import { HealthBookingProvider } from "./contexts/HealthBookingContext";
import AutomaticPageTranslator from "./components/AutomaticPageTranslator";
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
      <NativeWelcomeGate>
        <NativeAppLockGate>
        <NativeRuntimeBridge />
        {!isAdminRoute ? (
          <main className="desktop-access-block" aria-labelledby="desktop-access-title">
            <div>
              <span aria-hidden="true">SMAJ Pi Hub</span>
              <h1 id="desktop-access-title">Mobile and tablet only</h1>
              <p>Please open SMAJ Pi Hub on a mobile phone or tablet to continue.</p>
            </div>
          </main>
        ) : null}
        <div className={"mobile-tablet-app" + (isAdminRoute ? " desktop-admin-app" : "")}>
          <FoodCartProvider>
            <HealthBookingProvider>
              <RouterProvider router={router} />
            </HealthBookingProvider>
          </FoodCartProvider>
          <AuthToast />
          <GlobalFeedbackCenter />
          <AutomaticPageTranslator />
        </div>
        <PiBrowserHandoff />
        </NativeAppLockGate>
      </NativeWelcomeGate>
    </>
  );
}

export default App;
