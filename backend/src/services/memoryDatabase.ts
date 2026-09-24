import { ObjectId } from "mongodb";

type Document = Record<string, any>;
type Query = Record<string, any>;

const getValue = (document: Document, key: string) => document[key];

const sameValue = (left: any, right: any) => {
  if (left instanceof ObjectId || right instanceof ObjectId) {
    return String(left) === String(right);
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
};

const matchesObject = (value: any, condition: any) => value && typeof value === "object"
  && Object.entries(condition).every(([key, expected]) => sameValue(value[key], expected));

const matchesValue = (value: any, condition: any): boolean => {
  if (condition instanceof RegExp) return condition.test(String(value || ""));
  if (!condition || typeof condition !== "object" || condition instanceof ObjectId || condition instanceof Date) {
    return sameValue(value, condition);
  }
  if ("$ne" in condition && sameValue(value, condition.$ne)) return false;
  if ("$in" in condition && !condition.$in.some((item: any) => sameValue(value, item))) return false;
  if ("$gte" in condition && !(value >= condition.$gte)) return false;
  if ("$gt" in condition && !(value > condition.$gt)) return false;
  if ("$lte" in condition && !(value <= condition.$lte)) return false;
  if ("$lt" in condition && !(value < condition.$lt)) return false;
  if ("$elemMatch" in condition && (!Array.isArray(value) || !value.some((item: any) => matchesObject(item, condition.$elemMatch)))) return false;
  if ("$regex" in condition) {
    const flags = String(condition.$options || "");
    const regex = new RegExp(String(condition.$regex), flags);
    if (!regex.test(String(value || ""))) return false;
  }
  return true;
};

const matchesQuery = (document: Document, query: Query = {}): boolean =>
  Object.entries(query).every(([key, condition]) => {
    if (key === "$or") return Array.isArray(condition) && condition.some((item: Query) => matchesQuery(document, item));
    return matchesValue(getValue(document, key), condition);
  });

const applyUpdate = (document: Document, update: Document, inserting = false) => {
  if (update.$set) Object.assign(document, update.$set);
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, value]) => {
      document[key] = Number(document[key] || 0) + Number(value || 0);
    });
  }
  if (update.$unset) Object.keys(update.$unset).forEach((key) => delete document[key]);
  if (inserting && update.$setOnInsert) Object.assign(document, update.$setOnInsert);
  if (update.$push) {
    Object.entries(update.$push).forEach(([key, value]) => {
      document[key] = Array.isArray(document[key]) ? document[key] : [];
      document[key].push(value);
    });
  }
  if (update.$addToSet) {
    Object.entries(update.$addToSet).forEach(([key, value]) => {
      document[key] = Array.isArray(document[key]) ? document[key] : [];
      if (!document[key].some((item: any) => sameValue(item, value))) document[key].push(value);
    });
  }
  if (update.$pull) {
    Object.entries(update.$pull).forEach(([key, value]) => {
      document[key] = Array.isArray(document[key]) ? document[key].filter((item: any) => !(value && typeof value === "object" ? matchesObject(item, value) : sameValue(item, value))) : [];
    });
  }
};

class MemoryCursor {
  constructor(private documents: Document[]) {}

  sort(sort: Record<string, 1 | -1>) {
    const [[key, direction]] = Object.entries(sort);
    this.documents = [...this.documents].sort((a, b) => {
      const left = getValue(a, key);
      const right = getValue(b, key);
      const result = left > right ? 1 : left < right ? -1 : 0;
      return direction === -1 ? -result : result;
    });
    return this;
  }

  limit(count: number) {
    this.documents = this.documents.slice(0, count);
    return this;
  }

  skip(count: number) {
    this.documents = this.documents.slice(count);
    return this;
  }

  async toArray() {
    return this.documents.map((document) => ({ ...document }));
  }
}

export class MemoryCollection {
  private documents: Document[] = [];

  constructor(seed: Document[] = []) {
    this.documents = seed.map((document) => ({ _id: document._id || new ObjectId(), ...document }));
  }

  find(query: Query = {}) {
    return new MemoryCursor(this.documents.filter((document) => matchesQuery(document, query)));
  }

  async findOne(query: Query | ObjectId) {
    const normalized = query instanceof ObjectId ? { _id: query } : query;
    const found = this.documents.find((document) => matchesQuery(document, normalized));
    return found ? { ...found } : null;
  }

  async insertOne(document: Document) {
    const inserted = { _id: document._id || new ObjectId(), ...document };
    this.documents.push(inserted);
    return { insertedId: inserted._id };
  }

  async insertMany(documents: Document[]) {
    documents.forEach((document) => {
      this.documents.push({ _id: document._id || new ObjectId(), ...document });
    });
    return { insertedCount: documents.length };
  }

  async updateOne(query: Query, update: Document, options?: { upsert?: boolean }) {
    const found = this.documents.find((document) => matchesQuery(document, query));
    if (found) {
      applyUpdate(found, update);
      return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
    }
    if (options?.upsert) {
      const inserted = { _id: new ObjectId(), ...query };
      applyUpdate(inserted, update, true);
      this.documents.push(inserted);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: inserted._id };
    }
    return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
  }

  async updateMany(query: Query, update: Document) {
    let modifiedCount = 0;
    this.documents.forEach((document) => {
      if (matchesQuery(document, query)) {
        applyUpdate(document, update);
        modifiedCount += 1;
      }
    });
    return { modifiedCount };
  }

  async deleteOne(query: Query) {
    const index = this.documents.findIndex((document) => matchesQuery(document, query));
    if (index < 0) return { deletedCount: 0 };
    this.documents.splice(index, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(query: Query) {
    const remaining = this.documents.filter((document) => !matchesQuery(document, query));
    const deletedCount = this.documents.length - remaining.length;
    this.documents = remaining;
    return { deletedCount };
  }
  async countDocuments(query: Query = {}) {
    return this.documents.filter((document) => matchesQuery(document, query)).length;
  }

  aggregate(pipeline: Document[]) {
    const match = pipeline.find((stage) => stage.$match)?.$match || {};
    const group = pipeline.find((stage) => stage.$group)?.$group;
    if (!group?._id || group._id !== "$category") return new MemoryCursor([]);
    const counts = new Map<string, number>();
    this.documents.filter((document) => matchesQuery(document, match)).forEach((document) => {
      counts.set(document.category, (counts.get(document.category) || 0) + 1);
    });
    return new MemoryCursor([...counts.entries()].map(([_id, count]) => ({ _id, count })));
  }
}

export const createMemoryCollections = () => ({
  paymentCollection: new MemoryCollection(),
  marketplaceOrderCollection: new MemoryCollection(),
  orderDisputeCollection: new MemoryCollection(),
  productCollection: new MemoryCollection(),
  userCollection: new MemoryCollection(),
  reportCollection: new MemoryCollection(),
  favoriteCollection: new MemoryCollection(),
  reviewCollection: new MemoryCollection(),
  conversationCollection: new MemoryCollection(),
  messageCollection: new MemoryCollection(),
  notificationCollection: new MemoryCollection(),
  pushSubscriptionCollection: new MemoryCollection(),
  nativePushTokenCollection: new MemoryCollection(),
  deviceSessionCollection: new MemoryCollection(),
  onboardingCollection: new MemoryCollection(),
  supportCollection: new MemoryCollection(),
  heroBannerCollection: new MemoryCollection(),
  ambassadorCollection: new MemoryCollection(),
  streamContentCollection: new MemoryCollection(),
  streamPostCollection: new MemoryCollection(),
  streamReviewCollection: new MemoryCollection(),
  streamSettingsCollection: new MemoryCollection(),
  jobCollection: new MemoryCollection(),
  jobCompanyCollection: new MemoryCollection(),
  jobSavedCollection: new MemoryCollection(),
  jobApplicationCollection: new MemoryCollection(),
  jobProfileCollection: new MemoryCollection(),
  jobAuditCollection: new MemoryCollection(),
  jobBillingCollection: new MemoryCollection(),
  jobPaymentCollection: new MemoryCollection(),
  jobDisputeCollection: new MemoryCollection(),
  transportBookingCollection: new MemoryCollection(),
  transportDriverCollection: new MemoryCollection(),
  transportVehicleCollection: new MemoryCollection(),
  transportTripCollection: new MemoryCollection(),
  transportReceiptCollection: new MemoryCollection(),
  transportNotificationCollection: new MemoryCollection(),
  teacherApplicationCollection: new MemoryCollection(),
  universityCollection: new MemoryCollection(),
  universityProgramCollection: new MemoryCollection(),
  universityClaimCollection: new MemoryCollection(),
  universityApplicationCollection: new MemoryCollection(),
  universityPaymentCollection: new MemoryCollection(),
  courseCollection: new MemoryCollection(),
  coursePaymentCollection: new MemoryCollection(),
  enrollmentCollection: new MemoryCollection(),
  lessonProgressCollection: new MemoryCollection(),
  quizCollection: new MemoryCollection(),
  quizSubmissionCollection: new MemoryCollection(),
  certificateCollection: new MemoryCollection(),
});
