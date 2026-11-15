import { axiosClient } from "./axiosClient";

// Run before opening any SDK payment dialog. Both release and server must opt in.
export async function assertPiPaymentsReady() {
  if (import.meta.env.VITE_PI_PAYMENTS_ENABLED !== "true") throw new Error("Mainnet payments are awaiting Pi approval and wallet setup.");
  const { data } = await axiosClient.get("/health", { smajSkipReadRetry: true });
  if (data.status !== "ok" || data.paymentNetwork !== "Pi Network" || data.paymentsEnabled !== true) throw new Error("Mainnet payments are not enabled on the account server.");
}
