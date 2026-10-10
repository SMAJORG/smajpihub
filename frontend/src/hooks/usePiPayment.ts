import { ensurePiInitialized, withPiTimeout } from "../lib/piSdk";
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

const isTemporaryPiFailure = (error: unknown) => {
  const failure = error as { response?: { status?: number; data?: { error?: string; retryable?: boolean } } };
  const status = failure.response?.status;
  return failure.response?.data?.retryable !== false &&
    (!failure.response || status === 429 || (status !== undefined && status >= 500) ||
      (status === 409 && failure.response?.data?.error === "verification_pending"));
};

// Retry confirmation of the same transfer; never create a payment to retry a POST.
const postPiPayment = async <T,>(url: string, body: Record<string, unknown>) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axiosClient.post<T>(url, body, { timeout: 65000, headers: { "X-SMAJ-Silent": "true" } });
    } catch (error) {
      if (!isTemporaryPiFailure(error) || attempt >= 2) throw error;
      await new Promise<void>(resolve => window.setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
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
      const pi = await ensurePiInitialized();
      const recoveries: Promise<{ orderId: string; error?: unknown }>[] = [];
      const recoveryPaymentIds = new Set<string>();
      const recoverIncomplete = (payment: PaymentDTO) => {
        if (recoveryPaymentIds.has(payment.identifier)) return;
        recoveryPaymentIds.add(payment.identifier);
        const recovery = async () => {
          const { data } = await postPiPayment<{ orderId: string }>("/payments/incomplete", {
            paymentId: payment.identifier,
            txid: payment.transaction?.txid,
          });
          return data.orderId;
        };
        recoveries.push(
          recovery().then(
            recoveredOrderId => ({ orderId: recoveredOrderId }),
            error => ({ orderId: "", error })
          )
        );
      };
      await withPiTimeout(
        pi.authenticate(["payments"], recoverIncomplete),
        30000,
        "Pi authorization timed out. Check Pi Browser and try again."
      );
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
      if (data.order.paymentId && data.order.paymentStatus === "processing") {
        const { data: recoveredPayment } = await postPiPayment<{ orderId: string }>("/payments/incomplete", { paymentId: data.order.paymentId });
        if (recoveredPayment.orderId && recoveredPayment.orderId !== orderId) throw new Error("The recorded payment belongs to another order. Refresh this order before retrying.");
        if (recoveredPayment.orderId === orderId) {
          callbacks?.onComplete?.();
          return;
        }
      }
      if (data.order.status !== "pending") throw new Error("This order is no longer awaiting payment.");
      if (Math.round(data.order.pricePi * 1e7) !== Math.round(amount * 1e7))
        throw new Error("The order amount changed. Refresh the order before paying.");

      // The SDK returns before the wallet closes; keep the action busy until a terminal callback.
      let retriedAfterRecovery = false;
      let completion: Promise<void> | undefined;
      let completed = false;
      const createPayment = (): Promise<void> => withPiTimeout(
        new Promise<void>((resolve, reject) => {
          const result = pi.createPayment(
            {
              amount: Math.round(data.order.pricePi * 1e7) / 1e7,
              memo: `SMAJ Store order ${orderId}`,
              metadata: { orderId },
            },
            {
              onReadyForServerApproval: async paymentId => {
                try {
                  await postPiPayment("/payments/approve", { orderId, paymentId });
                  callbacks?.onReady?.();
                } catch (error) {
                  reject(error);
                }
              },
              onReadyForServerCompletion: async (paymentId, txid) => {
                if (completed) return;
                if (!completion) {
                  completion = (async () => {
                    await postPiPayment("/payments/complete", { orderId, paymentId, txid });
                    completed = true;
                    callbacks?.onComplete?.();
                    resolve();
                  })();
                }
                try {
                  await completion;
                } catch (error) {
                  completion = undefined;
                  // Keep the wallet action busy while Pi retries its completion callback.
                  if (!isTemporaryPiFailure(error)) reject(error);
                }
              },
              onCancel: () => {
                callbacks?.onCancel?.();
                resolve();
              },
              onError: async (error, payment) => {
                if (payment?.transaction?.txid) recoverIncomplete(payment);
                // Pi may discover a submitted payment only when createPayment runs.
                const results = await Promise.all(recoveries);
                const failedRecovery = results.find(result => result.error);
                if (failedRecovery) {
                  reject(failedRecovery.error);
                  return;
                }
                if (results.some(result => result.orderId === orderId)) {
                  callbacks?.onComplete?.();
                  resolve();
                  return;
                }
                if (results.length && !retriedAfterRecovery) {
                  retriedAfterRecovery = true;
                  createPayment().then(resolve, reject);
                  return;
                }
                reject(
                  results.length
                    ? new Error("The previous payment was recovered. Tap Continue Payment again for this order.")
                    : error
                );
              },
            }
          );
          Promise.resolve(result).catch(reject);
        }),
        180000,
        "Payment is taking longer than expected. Check Pi Wallet and this order before trying again."
      );
      await createPayment();
    } catch (error) {
      const serverMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      callbacks?.onError?.(
        serverMessage || (error instanceof Error ? error.message : "Payment could not complete. Please try again.")
      );
    } finally {
      payingRef.current = false;
      setIsPaying(false);
    }
  }, []);

  return { isPaying, payOrder };
};
