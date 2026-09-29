import { useCallback, useState } from "react";
import {
  approveJobsBillingPayment,
  cancelJobsBillingPayment,
  completeJobsBillingPayment,
  type JobsApiJob,
} from "../lib/jobsApi";
import { requestPiBrowserHandoff } from "../lib/piBrowserHandoff";
import { isPiPaymentAvailable, isSoloHostRuntime } from "../lib/soloHost";

type BillingPaymentCallbacks = {
  onReady?: () => void;
  onComplete?: (result: { job?: JobsApiJob }) => void;
  onCancel?: () => void;
  onError?: (message: string) => void;
};

const onIncompletePaymentFound = () => {
  console.info("Pi incomplete payment found before jobs billing checkout.");
};

export const useJobsBillingPayment = () => {
  const [isPaying, setIsPaying] = useState(false);

  const payBilling = useCallback(
    async (billingId: string, amount: number, memo: string, callbacks?: BillingPaymentCallbacks) => {
      if (!isPiPaymentAvailable()) {
        if (isSoloHostRuntime()) {
          callbacks?.onError?.("Pi payments are not yet available in SMAJ PI HUB SoloHost.");
          return;
        }
        requestPiBrowserHandoff("Pi payment required");
        return;
      }

      setIsPaying(true);
      try {
        await window.Pi!.authenticate(["payments"], onIncompletePaymentFound);
        await window.Pi!.createPayment(
          {
            amount,
            memo,
            metadata: { billingId },
          },
          {
            onReadyForServerApproval: async (paymentId: string) => {
              await approveJobsBillingPayment(billingId, paymentId);
              callbacks?.onReady?.();
            },
            onReadyForServerCompletion: async (paymentId: string, txid: string) => {
              const result = await completeJobsBillingPayment(billingId, paymentId, txid);
              callbacks?.onComplete?.(result);
            },
            onCancel: async (paymentId: string) => {
              await cancelJobsBillingPayment(billingId, paymentId).catch(() => undefined);
              callbacks?.onCancel?.();
            },
            onError: (error: Error) => {
              callbacks?.onError?.(error.message || "Payment failed.");
            },
          }
        );
      } finally {
        setIsPaying(false);
      }
    },
    []
  );

  return { isPaying, payBilling };
};
