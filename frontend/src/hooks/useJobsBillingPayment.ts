import { useCallback, useRef, useState } from "react";
import {
  approveJobsBillingPayment,
  cancelJobsBillingPayment,
  completeJobsBillingPayment,
  type JobsApiJob,
} from "../lib/jobsApi";
import { ensurePiInitialized, withPiTimeout } from "../lib/piSdk";
import { axiosClient } from "../lib/axiosClient";
import { requestPiBrowserHandoff } from "../lib/piBrowserHandoff";
import { isPiPaymentAvailable, isSoloHostRuntime } from "../lib/soloHost";
type Callbacks = {
  onReady?: () => void;
  onComplete?: (result: { job?: JobsApiJob }) => void;
  onCancel?: () => void;
  onError?: (message: string) => void;
};
export const useJobsBillingPayment = () => {
  const [isPaying, setIsPaying] = useState(false);
  const busy = useRef(false);
  const payBilling = useCallback(async (billingId: string, amount: number, memo: string, callbacks?: Callbacks) => {
    if (busy.current) return;
    if (!isPiPaymentAvailable()) {
      if (isSoloHostRuntime()) callbacks?.onError?.("Pi payments are unavailable in this deployment.");
      else requestPiBrowserHandoff("Pi payment required");
      return;
    }
    busy.current = true;
    setIsPaying(true);
    try {
      const { data } = await axiosClient.get("/jobs/billing/intents/" + encodeURIComponent(billingId));
      if (data.intent.status === "paid") {
        callbacks?.onComplete?.({});
        return;
      }
      if (data.intent.paymentId) {
        const resumed = await axiosClient.post("/jobs/billing/resume", { billingId });
        callbacks?.onComplete?.(resumed.data);
        return;
      }
      const pi = await ensurePiInitialized();
      let incomplete = false;
      await withPiTimeout(
        pi.authenticate(["payments"], () => {
          incomplete = true;
        }),
        30000,
        "Pi authorization timed out"
      );
      if (incomplete)
        throw new Error(
          "An existing payment needs confirmation. Resume its original Store or Jobs intent before creating another payment."
        );
      await new Promise<void>((resolve, reject) => {
        let terminal = false;
        const timer = window.setTimeout(
          () =>
            finish(
              new Error("Confirmation timed out. Check Pi Wallet and resume this billing payment; do not pay again.")
            ),
          180000
        );
        const finish = (error?: Error) => {
          if (terminal) return;
          terminal = true;
          window.clearTimeout(timer);
          error ? reject(error) : resolve();
        };
        let completion: Promise<void> | undefined;
        Promise.resolve(
          pi.createPayment(
            { amount, memo, metadata: { billingId } },
            {
              onReadyForServerApproval: async paymentId => {
                try {
                  await approveJobsBillingPayment(billingId, paymentId);
                  callbacks?.onReady?.();
                } catch (error) {
                  finish(error as Error);
                }
              },
              onReadyForServerCompletion: async (paymentId, txid) => {
                if (!completion)
                  completion = completeJobsBillingPayment(billingId, paymentId, txid)
                    .then(result => {
                      callbacks?.onComplete?.(result);
                      finish();
                    })
                    .catch(error => finish(error));
                await completion;
              },
              onCancel: async paymentId => {
                await cancelJobsBillingPayment(billingId, paymentId).catch(() => undefined);
                callbacks?.onCancel?.();
                finish();
              },
              onError: error => finish(error),
            }
          )
        ).catch(error => finish(error));
      });
    } catch (error) {
      callbacks?.onError?.(
        error instanceof Error ? error.message : "Resume the existing payment after checking your wallet."
      );
    } finally {
      busy.current = false;
      setIsPaying(false);
    }
  }, []);
  return { isPaying, payBilling };
};
