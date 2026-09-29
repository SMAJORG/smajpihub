import { useCallback, useState } from "react";
import { axiosClient } from "../lib/axiosClient";
import { requestPiBrowserHandoff } from "../lib/piBrowserHandoff";
import { isPiPaymentAvailable, isSoloHostRuntime } from "../lib/soloHost";

type PaymentCallbacks = {
  onReady?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onError?: (message: string) => void;
};

const onIncompletePaymentFound = () => {
  console.info("Pi incomplete payment found before checkout.");
};

export const usePiPayment = () => {
  const [isPaying, setIsPaying] = useState(false);

  const payOrder = useCallback(async (orderId: string, amount: number, callbacks?: PaymentCallbacks) => {
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
          memo: `SMAJ Store order ${orderId}`,
          metadata: { orderId },
        },
        {
          onReadyForServerApproval: async (paymentId: string) => {
            await axiosClient.post("/payments/approve", { orderId, paymentId });
            callbacks?.onReady?.();
          },
          onReadyForServerCompletion: async (paymentId: string, txid: string) => {
            await axiosClient.post("/payments/complete", { orderId, paymentId, txid });
            callbacks?.onComplete?.();
          },
          onCancel: () => {
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
  }, []);

  return { isPaying, payOrder };
};
