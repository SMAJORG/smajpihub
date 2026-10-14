import { ObjectId } from "mongodb";
import { completeJobsBillingRequest } from "../handlers/jobs";
import { platformAPIKeyClient } from "./platformAPIClient";
import { validPaymentId } from "./financialIntegrity";
export const recoverJobsBilling = async (app: any) => {
  const due = await app.locals.jobBillingCollection
    .find({ status: "processing" })
    .limit(20)
    .toArray();
  for (const intent of due) {
    if (
      !validPaymentId(intent.paymentId) ||
      !ObjectId.isValid(intent.employerId)
    )
      continue;
    try {
      const payment = (
        await platformAPIKeyClient.get(
          "/v2/payments/" + encodeURIComponent(intent.paymentId),
        )
      ).data;
      if (!payment.transaction?.txid) continue;
      const req: any = {
        app,
        session: { user: { userId: intent.employerId } },
        get: () => undefined,
        body: {
          billingId: intent.billingId,
          paymentId: intent.paymentId,
          txid: payment.transaction.txid,
        },
      };
      const res: any = {
        code: 200,
        status(code: number) {
          this.code = code;
          return this;
        },
        json() {
          if (this.code >= 400) throw new Error("Billing needs reconciliation");
        },
      };
      await completeJobsBillingRequest(req, res);
    } catch {
      console.warn("Jobs billing pending reconciliation", {
        billingId: intent.billingId,
      });
    }
  }
};
