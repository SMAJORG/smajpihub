import { useCallback, useRef, useState } from "react";
import { axiosClient } from "../lib/axiosClient";
import { requestPiBrowserHandoff } from "../lib/piBrowserHandoff";
import { isPiPaymentAvailable, isSoloHostRuntime } from "../lib/soloHost";
import type { PaymentDTO } from "../types/pi";
import type { Order } from "../types/marketplace";

type PaymentCallbacks = {
  onReady?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onError?: (message: string) => void;
};

export const usePiPayment = () => {
  const [isPaying, setIsPaying] = useState(false);
  const payingRef = useRef(false);

  const payOrder = useCallback(async (orderId: string, amount: number, callbacks?: PaymentCallbacks) => {
    if (payingRef.current) return;
    if (!isPiPaymentAvailable()) {
      if (isSoloHostRuntime()) {
        callbacks?.onError?.("Pi payments are not yet available in SMAJ PI HUB SoloHost.");
        return;
      }
      requestPiBrowserHandoff("Continue order payment", `/orders/${orderId}/track`);
      return;
    }

    payingRef.current = true;
    setIsPaying(true);
    try {
      const recoveries: Promise<{ orderId: string; error?: unknown }>[] = [];
      await window.Pi!.authenticate(["payments"], (payment: PaymentDTO) => {
        const pendingOrderId = String(payment.metadata?.orderId || "");
        const recovery = async () => {
          if (!pendingOrderId || !payment.transaction?.txid)
            throw new Error("An incomplete Pi payment needs attention before continuing. Open its order and try again.");
          const { data } = await axiosClient.get<{ order: Order }>(`/marketplace/orders/${pendingOrderId}`);
          if (data.order.paymentStatus !== "paid") {
            await axiosClient.post("/payments/complete", {
              orderId: pendingOrderId, paymentId: payment.identifier, txid: payment.transaction.txid,
            });
          }
        };
        recoveries.push(recovery().then(
          () => ({ orderId: pendingOrderId }),
          error => ({ orderId: pendingOrderId, error })
        ));
      });
      const recovered = await Promise.all(recoveries);
      const failed = recovered.find(result => result.error);
      if (failed) throw failed.error;
      if (recovered.some(result => result.orderId === orderId)) {
        callbacks?.onComplete?.();
        return;
      }
      const { data } = await axiosClient.get<{ order: Order }>(`/marketplace/orders/${orderId}`);
      if (data.order.paymentStatus === "paid") {
        callbacks?.onComplete?.();
        return;
      }
      if (data.order.status !== "pending") throw new Error("This order is no longer awaiting payment.");
      if (data.order.pricePi !== amount) throw new Error("The order amount changed. Refresh the order before paying.");

      // The SDK returns before the wallet closes; keep the action busy until a terminal callback.
      await new Promise<void>((resolve, reject) => {
        const result = window.Pi!.createPayment(
          { amount: data.order.pricePi, memo: `SMAJ Store order ${orderId}`, metadata: { orderId } },
          {
            onReadyForServerApproval: async paymentId => {
              try {
                await axiosClient.post("/payments/approve", { orderId, paymentId });
                callbacks?.onReady?.();
              } catch (error) { reject(error); }
            },
            onReadyForServerCompletion: async (paymentId, txid) => {
              try {
                await axiosClient.post("/payments/complete", { orderId, paymentId, txid });
                callbacks?.onComplete?.();
                resolve();
              } catch (error) { reject(error); }
            },
            onCancel: () => { callbacks?.onCancel?.(); resolve(); },
            onError: error => reject(error),
          }
        );
        Promise.resolve(result).catch(reject);
      });
    } catch (error) {
      callbacks?.onError?.(error instanceof Error ? error.message : "Payment could not complete. Please try again.");
    } finally {
      payingRef.current = false;
      setIsPaying(false);
    }
  }, []);

  return { isPaying, payOrder };
};