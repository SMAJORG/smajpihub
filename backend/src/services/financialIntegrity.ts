import { ClientSession } from "mongodb";
import { platformAPIKeyClient } from "./platformAPIClient";
import env from "../environments";

export const financialError = (message: string, status = 409) =>
  Object.assign(new Error(message), { status });
export const validPaymentId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-z0-9_-]{1,200}$/i.test(id);
export const financialTransaction = async <T>(
  app: any,
  work: (session?: ClientSession) => Promise<T>,
): Promise<T> => {
  if (!app.locals.mongoClient) {
    if (!app.locals.memoryDatabase)
      throw financialError("Transactional database is unavailable", 503);
    return work();
  }
  const session = app.locals.mongoClient.startSession();
  try {
    return (await session.withTransaction(() => work(session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    })) as T;
  } finally {
    await session.endSession();
  }
};
export const verifyIncomingPayment = (
  payment: any,
  expected: {
    paymentId: string;
    payer: string;
    amount: number;
    metadataKey: string;
    intentId: string;
  },
  completed = false,
  txid?: string,
) => {
  if (
    !validPaymentId(expected.paymentId) ||
    payment?.identifier !== expected.paymentId ||
    payment.direction !== "user_to_app" ||
    payment.user_uid !== expected.payer ||
    String(payment.metadata?.[expected.metadataKey] || "") !==
      expected.intentId ||
    !Number.isFinite(expected.amount) ||
    expected.amount <= 0 ||
    !Number.isFinite(payment.amount) ||
    Math.round(payment.amount * 1e7) !== Math.round(expected.amount * 1e7) ||
    payment.status?.cancelled ||
    payment.status?.user_cancelled ||
    payment.network !== env.pi_network
  )
    throw financialError("Pi payment does not match this economic intent", 400);
  if (
    completed &&
    (payment.transaction?.txid !== txid ||
      payment.transaction?.verified !== true ||
      payment.status?.transaction_verified !== true ||
      payment.status?.developer_completed !== true)
  )
    throw financialError(
      "Pi verification is pending; resume the same payment",
      409,
    );
};
// Deterministic _id constraints use MongoDB's built-in unique index, including across services.
export const bindPayment = async (
  app: any,
  payment: any,
  intentKey: string,
  session?: ClientSession,
) => {
  if (!app.locals.paymentCollection)
    throw financialError("Payment ledger unavailable", 503);
  const options = session ? { session } : {};
  // Protect existing receipts before any separately approved ledger backfill.
  const aliases: any[] = [{ paymentId: payment.identifier }];
  if (payment.transaction?.txid)
    aliases.push({ paymentTxid: payment.transaction.txid });
  const oldOrder = await app.locals.marketplaceOrderCollection?.findOne(
    { $or: aliases },
    options,
  );
  if (oldOrder && intentKey !== "store:" + oldOrder._id.toString())
    throw financialError("Transfer belongs to an existing Store order");
  const oldBilling = await app.locals.jobBillingCollection?.findOne(
    { $or: aliases },
    options,
  );
  if (oldBilling && intentKey !== "jobs:" + oldBilling.billingId)
    throw financialError("Transfer belongs to an existing Jobs billing intent");

  const claim = async (key: string) => {
    try {
      await app.locals.paymentCollection.updateOne(
        { _id: key, intentKey },
        {
          $setOnInsert: {
            intentKey,
            paymentId: payment.identifier,
            network: payment.network,
            createdAt: new Date(),
          },
        },
        { ...options, upsert: true },
      );
    } catch (e: any) {
      if (e.code === 11000)
        throw financialError(
          "This transfer is already bound to another intent",
        );
      throw e;
    }
  };
  const paymentKey = "payment:" + payment.network + ":" + payment.identifier;
  await claim(paymentKey);
  if (
    payment.status?.developer_completed === true &&
    payment.status?.transaction_verified === true &&
    payment.transaction?.verified === true
  ) {
    await app.locals.paymentCollection.updateOne(
      { _id: paymentKey, intentKey },
      {
        $set: {
          verified: true,
          amountPi: payment.amount,
          payerUid: payment.user_uid,
          direction: payment.direction,
          recipientAddress: payment.to_address,
          txid: payment.transaction.txid,
          metadata: payment.metadata,
          verifiedAt: new Date(),
        },
      },
      options,
    );
  }
  if (payment.transaction?.verified === true && payment.transaction?.txid) {
    try {
      await app.locals.paymentCollection.updateOne(
        { _id: "credit:" + intentKey, paymentId: payment.identifier },
        {
          $setOnInsert: {
            intentKey,
            paymentId: payment.identifier,
            createdAt: new Date(),
          },
        },
        { ...options, upsert: true },
      );
    } catch (e: any) {
      if (e.code === 11000)
        throw financialError(
          "This intent already has another verified receipt",
        );
      throw e;
    }
    await claim(
      "transaction:" + payment.network + ":" + payment.transaction.txid,
    );
  }
};
export const verifyOutboundPayment = async (
  paymentId: string,
  expected: {
    uid: string;
    amount: number;
    metadataKey: string;
    intentId: string;
  },
) => {
  if (!validPaymentId(paymentId))
    throw financialError("Invalid outbound payment identifier", 400);
  const payment = (
    await platformAPIKeyClient.get(
      "/v2/payments/" + encodeURIComponent(paymentId),
    )
  ).data;
  if (
    payment?.identifier !== paymentId ||
    payment.direction !== "app_to_user" ||
    payment.user_uid !== expected.uid ||
    payment.network !== (env as any).pi_network ||
    Number(payment.amount) !== expected.amount ||
    payment.metadata?.[expected.metadataKey] !== expected.intentId ||
    payment.status?.cancelled ||
    payment.status?.user_cancelled ||
    !payment.to_address ||
    !payment.transaction?.txid ||
    payment.transaction.verified !== true ||
    payment.status?.transaction_verified !== true ||
    payment.status?.developer_completed !== true
  )
    throw financialError(
      "Outbound transfer is not authoritatively verified",
      409,
    );
  return payment;
};
