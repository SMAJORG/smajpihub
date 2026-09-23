import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { createNotification } from "../services/notifications";
import env from "../environments";
import { resolveCurrentUser } from "../services/auth";
import { assertNoBase64Images, resolveImageValue } from "../services/imageStorage";
import { piFromUsdt } from "../services/piPricing";
import { canTransitionOrder, releaseOrderInventory, timelineEntry } from "../services/orderLifecycle";

const STORE_CATEGORIES = ["Deals", "Grocery", "Electronics", "Mobiles", "Laptops", "Fashion", "Beauty", "Home", "Vehicles", "Accessories"];

const serialize = (document: Record<string, any> | null) =>
  document ? { ...document, _id: document._id.toString() } : null;
const verificationStatus = (user: any) => ["none", "pending", "approved", "rejected"].includes(user?.verificationStatus) ? user.verificationStatus : user?.verificationRequested ? "pending" : "none";
const hasCompletePiProfile = (user: any) => Boolean(user?.displayName && user?.piUsername && user?.country && user?.contactPhone && user?.avatar && user?.bio);
const canShowPublicVerification = (user: any) => user?.role === "admin" || hasCompletePiProfile(user);
const normalizeVerificationLevel = (user: any) => {
  const level = user?.verificationLevel === "verified" ? "pi_verified" : user?.verificationLevel;
  if (level === "trusted_seller") return user?.sellerActive || user?.role === "seller" || user?.role === "admin" ? "trusted_seller" : "pi_verified";
  if (level === "seller_verified") return user?.sellerActive || user?.role === "seller" ? "seller_verified" : "pi_verified";
  if (level === "pi_verified") return "pi_verified";
  return "basic";
};
const publicVerificationLevel = (user: any) => verificationStatus(user) === "approved" && canShowPublicVerification(user) ? normalizeVerificationLevel(user) : "basic";
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const withResolvedPiPrice = (document: Record<string, any>) => {
  const pricePi = Number(document.pricePi);
  if (Number.isFinite(pricePi) && pricePi > 0) return document;
  const fallbackPi = piFromUsdt(document.priceUsdt);
  return fallbackPi > 0 ? { ...document, pricePi: fallbackPi } : document;
};

const enrichOrdersWithProductPrices = async (req: Request, orders: any[]) => {
  const productIds = [...new Set(orders.map((order) => order.productId).filter(ObjectId.isValid))].map((id) => new ObjectId(id));
  if (!productIds.length) return orders;
  const products = await req.app.locals.productCollection.find({ _id: { $in: productIds } }).project({ pricePi: 1, priceUsdt: 1 }).toArray();
  const productById = new Map<string, any>(products.map((product: any) => [product._id.toString(), product]));
  return orders.map((order) => {
    const pricePi = Number(order.pricePi);
    if (Number.isFinite(pricePi) && pricePi > 0) return order;
    const product = productById.get(order.productId);
    if (!product) return order;
    const productPricePi = Number(product.pricePi);
    const fallbackPi = Number.isFinite(productPricePi) && productPricePi > 0 ? productPricePi : piFromUsdt(product.priceUsdt);
    return fallbackPi > 0 ? { ...order, pricePi: fallbackPi } : order;
  });
};

const requireUser = async (req: Request, res: Response) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    return null;
  }
  return currentUser;
};

const productFields = (body: any) => {
  const priceUsdt = Number(body?.priceUsdt);
  const pricePi = Number(body?.pricePi);
  const cleanRecord = (value: unknown, limit = 20) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [String(key).trim().slice(0, 50), String(item || "").trim().slice(0, 180)])
      .filter(([key, item]) => key && item)
      .slice(0, limit));
  };
  const productStatus = ["draft", "active", "out_of_stock", "hidden"].includes(body?.productStatus) ? body.productStatus : "active";
  const variants = Array.isArray(body?.variants) ? body.variants.map((variant: any) => {
    const variantPriceUsdt = Number(variant?.priceUsdt);
    const variantPricePi = Number(variant?.pricePi);
    return {
      color: String(variant?.color || "").trim().slice(0, 60),
      size: String(variant?.size || "").trim().slice(0, 60),
      material: String(variant?.material || "").trim().slice(0, 80),
      storage: String(variant?.storage || "").trim().slice(0, 60),
      ram: String(variant?.ram || "").trim().slice(0, 60),
      weight: String(variant?.weight || "").trim().slice(0, 60),
      model: String(variant?.model || "").trim().slice(0, 80),
      edition: String(variant?.edition || "").trim().slice(0, 80),
      style: String(variant?.style || "").trim().slice(0, 80),
      stock: Number.isFinite(Number(variant?.stock)) ? Math.max(0, Number(variant.stock)) : 0,
      pricePi: Number.isFinite(variantPricePi) && variantPricePi > 0 ? variantPricePi : Number.isFinite(variantPriceUsdt) && variantPriceUsdt > 0 ? piFromUsdt(variantPriceUsdt) : undefined,
      priceUsdt: Number.isFinite(variantPriceUsdt) && variantPriceUsdt > 0 ? variantPriceUsdt : undefined,
      image: String(variant?.image || "").trim(),
    };
  }).filter((variant: any) => Object.entries(variant).some(([key, value]) => key !== "stock" && key !== "pricePi" && key !== "priceUsdt" && key !== "image" && Boolean(value)) || Boolean(variant.image)).slice(0, 50) : [];
  return {
    title: String(body?.title || "").trim(),
    image: String(body?.image || "").trim(),
    description: String(body?.description || "").trim(),
    category: String(body?.category || "").trim(),
    location: String(body?.location || "").trim(),
    sellerContact: String(body?.sellerContact || "").trim(),
    pricePi: Number.isFinite(pricePi) && pricePi > 0 ? pricePi : piFromUsdt(priceUsdt),
    priceUsdt,
    condition: String(body?.condition || "").trim(),
    quantity: Number(body?.quantity || 1),
    deliveryOption: String(body?.deliveryOption || "").trim(),
    country: String(body?.country || "").trim(),
    stateRegion: String(body?.stateRegion || "").trim(),
    city: String(body?.city || "").trim(),
    areaAddress: String(body?.areaAddress || "").trim(),
    sellerAgreementAccepted: Boolean(body?.sellerAgreementAccepted),
    images: Array.isArray(body?.images) ? body.images.map((item: unknown) => String(item)).filter(Boolean).slice(0, 12) : [],
    productStatus,
    variants,
    specifications: cleanRecord(body?.specifications),
    attributes: cleanRecord(body?.attributes),
    shipping: {
      weight: String(body?.shipping?.weight || "").trim().slice(0, 60),
      dimensions: String(body?.shipping?.dimensions || "").trim().slice(0, 80),
      method: String(body?.shipping?.method || "").trim().slice(0, 80),
      deliveryTime: String(body?.shipping?.deliveryTime || "").trim().slice(0, 80),
      pickupAvailable: Boolean(body?.shipping?.pickupAvailable),
    },
    warranty: ["No Warranty", "7 Days", "30 Days", "6 Months", "1 Year"].includes(body?.warranty) ? body.warranty : "No Warranty",
    returnPolicy: ["No Returns", "7 Days", "14 Days", "30 Days"].includes(body?.returnPolicy) ? body.returnPolicy : "No Returns",
    seo: {
      slug: String(body?.seo?.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120),
      metaTitle: String(body?.seo?.metaTitle || "").trim().slice(0, 120),
      metaDescription: String(body?.seo?.metaDescription || "").trim().slice(0, 240),
    },
    digitalProduct: {
      enabled: Boolean(body?.digitalProduct?.enabled),
      fileUrl: String(body?.digitalProduct?.fileUrl || "").trim().slice(0, 500),
      downloadLimit: Number.isFinite(Number(body?.digitalProduct?.downloadLimit)) ? Math.max(0, Number(body.digitalProduct.downloadLimit)) : 0,
      licenseKey: String(body?.digitalProduct?.licenseKey || "").trim().slice(0, 300),
    },
    serviceDetails: {
      enabled: Boolean(body?.serviceDetails?.enabled),
      duration: String(body?.serviceDetails?.duration || "").trim().slice(0, 80),
      locationType: String(body?.serviceDetails?.locationType || "").trim().slice(0, 80),
      appointmentRequired: Boolean(body?.serviceDetails?.appointmentRequired),
    },
  };
};

const productValidationMessage = (product: ReturnType<typeof productFields>) => {
  if (!product.title) return "Product title is required.";
  if (product.title.length < 3) return "Product title must be at least 3 characters.";
  if (!product.image && !product.images.length) return "At least one product image is required.";
  if (!product.description || product.description.length < 20) return "Product description must be at least 20 characters.";
  if (!product.category) return "Product category is required.";
  if (!product.condition) return "Product condition is required.";
  if (!Number.isFinite(product.quantity) || product.quantity < 1) return "Product quantity must be at least 1.";
  if (!Number.isFinite(product.pricePi) || product.pricePi <= 0) return "Pi price must be greater than zero.";
  if (!Number.isFinite(product.priceUsdt) || product.priceUsdt <= 0) return "USDT price must be greater than zero.";
  if (!product.country) return "Country is required.";
  if (!product.stateRegion) return "State or region is required.";
  if (!product.city) return "City is required.";
  if (!product.areaAddress) return "Area or address summary is required.";
  if (!product.location) return "Product location is required.";
  if (!product.deliveryOption) return "Delivery option is required.";
  if (!product.sellerContact) return "Seller contact is required.";
  if (!product.sellerAgreementAccepted) return "Seller agreement must be accepted before listing.";
  return "";
};

const validProduct = (product: ReturnType<typeof productFields>) =>
  product.title && product.image && product.description && product.category && product.location && product.sellerContact
  && Number.isFinite(product.pricePi) && product.pricePi > 0
  && Number.isFinite(product.priceUsdt) && product.priceUsdt > 0
  && product.condition && product.deliveryOption && product.country && product.stateRegion && product.city && product.areaAddress
  && Number.isFinite(product.quantity) && product.quantity > 0 && product.sellerAgreementAccepted;

const resolveProductImageFields = async (fields: ReturnType<typeof productFields>) => {
  const sourceImages: string[] = fields.images.length ? fields.images : [fields.image];
  const resolvedImages = await Promise.all(sourceImages
    .map((image: string, index: number) => resolveImageValue(image, "product", `product-${index + 1}`)));
  const variants = await Promise.all(fields.variants.map(async (variant: any, index: number) => ({
    ...variant,
    image: variant.image ? await resolveImageValue(variant.image, "product-variant", `variant-${index + 1}`) : "",
  })));
  const nextFields = {
    ...fields,
    image: resolvedImages[0],
    images: resolvedImages,
    variants,
  };
  assertNoBase64Images(nextFields, "product");
  return nextFields;
};

export default function mountMarketplaceEndpoints(router: Router) {
  router.get("/products", async (req, res) => {
    const query: Record<string, any> = { active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" };
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const location = String(req.query.location || "").trim();
    const country = String(req.query.country || "").trim();
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    const verified = String(req.query.verified || "") === "true";
    if (search) {
      const regex = { $regex: escapeRegex(search).slice(0, 80), $options: "i" };
      query.$or = [{ title: regex }, { description: regex }, { category: regex }, { sellerName: regex }, { location: regex }, { country: regex }];
    }
    if (category && category !== "All") query.category = category;
    if (location) query.location = { $regex: location, $options: "i" };
    if (country) query.country = { $regex: escapeRegex(country).slice(0, 80), $options: "i" };
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      query.pricePi = {};
      if (Number.isFinite(minPrice)) query.pricePi.$gte = Math.max(0, minPrice);
      if (Number.isFinite(maxPrice)) query.pricePi.$lte = Math.max(0, maxPrice);
    }
    if (verified) {
      query.verificationStatus = "approved";
      query.verificationLevel = { $in: ["pi_verified", "seller_verified", "trusted_seller", "verified"] };
    }
    const sort: Record<string, 1 | -1> = req.query.sort === "price-low" ? { pricePi: 1 } : req.query.sort === "price-high" ? { pricePi: -1 } : { createdAt: -1 };
    const products = await req.app.locals.productCollection.find(query).sort(sort).limit(60).toArray();
    return res.status(200).json({ products: products.map(withResolvedPiPrice).map(serialize) });
  });

  router.get("/feed", async (req, res) => {
    const user = await resolveCurrentUser(req);
    const visible = { active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" };
    const latest = await req.app.locals.productCollection.find(visible).sort({ createdAt: -1 }).limit(8).toArray();
    const counts = await req.app.locals.productCollection.aggregate([{ $match: visible }, { $group: { _id: "$category", count: { $sum: 1 } } }]).toArray();

    if (!user) {
      return res.status(200).json({ latest: latest.map(withResolvedPiPrice).map(serialize), recommended: latest.map(withResolvedPiPrice).map(serialize), categories: STORE_CATEGORIES.map((name) => ({ name, count: counts.find((item: any) => item._id === name)?.count || 0 })), savedIds: [] });
    }

    const [favorites, orders] = await Promise.all([
      req.app.locals.favoriteCollection.find({ userId: user.uid }).limit(20).toArray(),
      req.app.locals.marketplaceOrderCollection.find({ buyerId: user.uid }).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);
    const preferredCategories = [...new Set(orders.map((item: any) => item.productCategory).filter(Boolean))];
    const recommended = await req.app.locals.productCollection.find(preferredCategories.length ? { ...visible, category: { $in: preferredCategories } } : visible).sort({ createdAt: -1 }).limit(8).toArray();
    return res.status(200).json({ latest: latest.map(withResolvedPiPrice).map(serialize), recommended: (recommended.length ? recommended : latest).map(withResolvedPiPrice).map(serialize), categories: STORE_CATEGORIES.map((name) => ({ name, count: counts.find((item: any) => item._id === name)?.count || 0 })), savedIds: favorites.map((item: any) => item.productId) });
  });

  router.get("/products/:id", async (req, res) => {
    const user = await resolveCurrentUser(req);
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    }
    const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(req.params.id), active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" });
    if (!product) {
      return res.status(404).json({ error: "not_found", message: "Product not found" });
    }
    const [seller, related, favorite] = await Promise.all([
      req.app.locals.userCollection.findOne({ uid: product.sellerId }),
      req.app.locals.productCollection.find({ category: product.category, _id: { $ne: product._id }, active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" }).sort({ createdAt: -1 }).limit(6).toArray(),
      user ? req.app.locals.favoriteCollection.findOne({ userId: user.uid, productId: req.params.id }) : null,
    ]);
    return res.status(200).json({ product: serialize(withResolvedPiPrice(product)), seller: seller ? { uid: seller.uid, displayName: seller.displayName, piUsername: seller.piUsername, avatar: seller.avatar || "", country: seller.country, verificationLevel: publicVerificationLevel(seller), verificationStatus: verificationStatus(seller), createdAt: seller.createdAt } : null, related: related.map(withResolvedPiPrice).map(serialize), saved: Boolean(favorite) });
  });

  router.post("/products", async (req, res) => {
    const sessionUser = await requireUser(req, res);
    if (!sessionUser) return;
    const freshUser = await req.app.locals.userCollection.findOne({ uid: sessionUser.uid });
    const user = freshUser || sessionUser;
    if (user.role !== "seller" && !user.sellerActive) {
      return res.status(403).json({ error: "seller_required", message: "Activate seller tools before listing products." });
    }

    const fields = productFields(req.body);
    const validationMessage = productValidationMessage(fields);

    if (validationMessage || !validProduct(fields)) {
      return res.status(400).json({ error: "bad_request", message: validationMessage || "Complete all required product fields" });
    }

    let resolvedFields: Awaited<ReturnType<typeof resolveProductImageFields>>;
    try {
      resolvedFields = await resolveProductImageFields(fields);
    } catch (err: any) {
      if (err?.statusCode === 413) return res.status(413).json({ error: "payload_too_large", message: err.message });
      if (err?.statusCode === 400 || err?.statusCode === 503) return res.status(err.statusCode).json({ error: "image_upload_failed", message: err.message });
      console.error("Product image upload failed:", err);
      return res.status(500).json({ error: "image_upload_failed", message: "Product image upload failed." });
    }

    const images = resolvedFields.images;
    const autoApprove = env.marketplace_auto_approve_products;
    const sellerVerificationLevel = publicVerificationLevel(user);
    const product = {
      sellerId: user.uid,
      sellerName: user.displayName || user.piUsername || user.username,
      sellerAvatar: user.avatar || "",
      piUsername: user.piUsername || user.username,
      verificationLevel: sellerVerificationLevel,
      verificationStatus: verificationStatus(user),
      ...resolvedFields,
      image: images[0],
      images,
      active: fields.productStatus !== "out_of_stock" && fields.productStatus !== "draft",
      approved: fields.productStatus === "draft" ? false : autoApprove,
      reviewStatus: fields.productStatus === "draft" ? "pending" : autoApprove ? "approved" : "pending",
      rejectionReason: "",
      hidden: fields.productStatus === "hidden",
      createdAt: new Date(),
    };
    assertNoBase64Images(product, "product");
    const result = await req.app.locals.productCollection.insertOne(product);
    await req.app.locals.userCollection.updateOne(
      { uid: user.uid },
      { $set: { role: user.role === "admin" ? "admin" : "seller", roles: [user.role === "admin" ? "admin" : "seller"], sellerActive: true } },
    );
    return res.status(201).json({ product: serialize({ ...product, _id: result.insertedId }) });
  });

  router.get("/orders", async (req, res) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(200).json({ orders: [] });
    const orders = await req.app.locals.marketplaceOrderCollection
      .find({ $or: [{ buyerId: user.uid }, { sellerId: user.uid }] })
      .sort({ createdAt: -1 })
      .toArray();
    const enrichedOrders = await enrichOrdersWithProductPrices(req, orders);
    return res.status(200).json({ orders: enrichedOrders.map(serialize) });
  });

  router.get("/orders/:id", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid order id" });
    }
    const order = await req.app.locals.marketplaceOrderCollection.findOne({
      _id: new ObjectId(req.params.id),
      $or: [{ buyerId: user.uid }, { sellerId: user.uid }],
    });
    if (!order) {
      return res.status(404).json({ error: "not_found", message: "Order not found" });
    }
    const [enrichedOrder] = await enrichOrdersWithProductPrices(req, [order]);
    return res.status(200).json({ order: serialize(enrichedOrder) });
  });

  router.post("/orders", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const productId = String(req.body?.productId || "");
    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    }

    const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(productId), active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" });
    if (!product) {
      return res.status(404).json({ error: "not_found", message: "Product not found" });
    }
    if (product.sellerId === user.uid) {
      return res.status(400).json({ error: "bad_request", message: "You cannot order your own product" });
    }

    const quantity = Math.min(20, Math.max(1, Math.floor(Number(req.body?.quantity) || 1)));
    const reservation = await req.app.locals.productCollection.updateOne(
      { _id: product._id, active: true, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity }, $set: { updatedAt: new Date() } },
    );
    if (!reservation.modifiedCount) {
      return res.status(409).json({ error: "out_of_stock", message: "The requested quantity is no longer available" });
    }
    const unitPricePi = Number(withResolvedPiPrice(product).pricePi);

    const order = {
      buyerId: user.uid,
      buyerName: user.displayName || user.piUsername || user.username,
      sellerId: product.sellerId,
      sellerName: product.sellerName || product.piUsername || "Pi seller",
      productId,
      productTitle: product.title,
      productImage: product.image,
      productCategory: product.category,
      unitPricePi,
      quantity,
      pricePi: unitPricePi * quantity,
      inventoryReserved: true,
      inventoryReleased: false,
      status: "pending",
      paymentStatus: "pending",
      paymentId: null,
      paymentTxid: null,
      paidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      timeline: [
        timelineEntry("pending", "Order Created", "Your SMAJ Store order was created successfully."),
        timelineEntry("payment_pending", "Payment Pending", "Open Pi Browser to complete payment."),
      ],
    };
    let result;
    try {
      result = await req.app.locals.marketplaceOrderCollection.insertOne(order);
    } catch (error) {
      await req.app.locals.productCollection.updateOne(
        { _id: product._id },
        { $inc: { quantity }, $set: { updatedAt: new Date() } },
      );
      throw error;
    }
    await Promise.all([
      createNotification(req.app, { userId: user.uid, type: "order_created", title: "Order created", message: `${product.title} order was created. Payment is pending.`, relatedId: result.insertedId.toString(), image: product.image }),
      createNotification(req.app, { userId: user.uid, type: "payment_pending", title: "Payment pending", message: `Complete payment for ${product.title} to confirm your order.`, relatedId: result.insertedId.toString(), image: product.image }),
      createNotification(req.app, { userId: product.sellerId, type: "new_order", title: "New order", message: `${order.buyerName} ordered ${product.title}`, relatedId: result.insertedId.toString(), image: product.image }),
    ]);
    return res.status(201).json({ order: serialize({ ...order, _id: result.insertedId }) });
  });

  router.post("/products/:id/report", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    }
    const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ error: "not_found", message: "Product not found" });
    if (product.sellerId === user.uid) return res.status(400).json({ error: "bad_request", message: "You cannot report your own product" });
    const reason = String(req.body?.reason || "").trim();
    if (!reason || reason.length > 300) return res.status(400).json({ error: "bad_request", message: "Provide a report reason" });
    await req.app.locals.reportCollection.insertOne({
      targetType: "product",
      targetId: req.params.id,
      targetName: product.title,
      reason,
      reportedBy: user.uid,
      reporterName: user.displayName || user.username,
      resolved: false,
      createdAt: new Date(),
    });
    return res.status(201).json({ message: "Product report submitted" });
  });

  router.patch("/orders/:id/status", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid order id" });
    }
    const status = req.body?.status;
    if (!["processing", "shipped", "delivered", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid order status" });
    }
    const order = await req.app.locals.marketplaceOrderCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!order || (order.buyerId !== user.uid && order.sellerId !== user.uid)) {
      return res.status(404).json({ error: "not_found", message: "Order not found" });
    }
    if (status === "cancelled" && order.buyerId !== user.uid && order.sellerId !== user.uid) {
      return res.status(403).json({ error: "forbidden", message: "Only the buyer or seller can cancel this order" });
    }
    if (["processing", "shipped"].includes(status) && order.sellerId !== user.uid) {
      return res.status(403).json({ error: "forbidden", message: "Only the seller can update fulfillment status" });
    }
    if (["delivered", "completed"].includes(status) && order.buyerId !== user.uid) {
      return res.status(403).json({ error: "forbidden", message: "Only the buyer can confirm delivery" });
    }
    if (!canTransitionOrder(order.status, status)) {
      return res.status(409).json({
        error: "invalid_transition",
        message: `Order cannot move from ${order.status} to ${status}`,
      });
    }
    const labels: Record<string, string> = {
      processing: "Processing",
      shipped: "Shipped",
      delivered: "Delivered",
      completed: "Completed",
      cancelled: "Cancelled",
    };
    const noteMap: Record<string, string> = {
      processing: "Seller started preparing your order.",
      shipped: "Your SMAJ Store order is on the way.",
      delivered: "Buyer confirmed the order was delivered.",
      completed: "Buyer confirmed receipt. The order is complete.",
      cancelled: "The order was cancelled before fulfillment.",
    };
    const updates: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
      timeline: [...(Array.isArray(order.timeline) ? order.timeline : []), timelineEntry(status, labels[status], noteMap[status])],
    };
    const transition = await req.app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id, status: order.status },
      { $set: updates },
    );
    if (!transition.modifiedCount) {
      return res.status(409).json({ error: "order_changed", message: "Order changed while it was being updated" });
    }
    if (status === "cancelled") {
      await releaseOrderInventory(req.app, order, "order_cancelled");
    }
    const receiverId = order.buyerId === user.uid ? order.sellerId : order.buyerId;
    const notificationTitle = status === "shipped" ? "Order shipped" : status === "completed" ? "Delivery confirmed" : `Order ${status}`;
    const notificationMessage = status === "shipped"
      ? `${order.productTitle} is on the way. Confirm receipt after it arrives.`
      : status === "completed"
        ? `The buyer confirmed receipt of ${order.productTitle}.`
        : `${order.productTitle} was marked ${status}`;
    await createNotification(req.app, { userId: receiverId, type: status === "completed" ? "order_completed" : "order_update", title: notificationTitle, message: notificationMessage, relatedId: order._id.toString(), image: order.productImage });
    return res.status(200).json({ message: `Order marked ${status}` });
  });

  router.post("/orders/:id/refund-request", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid order id" });
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10 || reason.length > 500) return res.status(400).json({ error: "bad_request", message: "Refund reason must be 10-500 characters" });
    const order = await req.app.locals.marketplaceOrderCollection.findOne({ _id: new ObjectId(req.params.id), buyerId: user.uid });
    if (!order) return res.status(404).json({ error: "not_found", message: "Order not found" });
    if (order.paymentStatus !== "paid" || !["paid", "processing", "shipped", "delivered", "completed"].includes(order.status)) {
      return res.status(409).json({ error: "not_refundable", message: "Only paid orders can have a refund request" });
    }
    if (["requested", "approved", "manual_required", "completed"].includes(order.refundStatus)) {
      return res.status(409).json({ error: "refund_exists", message: "A refund workflow already exists for this order" });
    }
    const now = new Date();
    await req.app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id },
      { $set: { refundStatus: "requested", refundReason: reason, refundRequestedAt: now, refundRequestedBy: user.uid, updatedAt: now } },
    );
    await Promise.all([
      createNotification(req.app, { userId: order.sellerId, type: "refund_requested", title: "Refund requested", message: `${order.buyerName} requested a refund for ${order.productTitle}.`, relatedId: req.params.id, image: order.productImage }),
      createNotification(req.app, { userId: user.uid, type: "refund_requested", title: "Refund request received", message: "An administrator will review your request. Pi refunds require a separately recorded return transaction.", relatedId: req.params.id, image: order.productImage }),
    ]);
    return res.status(201).json({ message: "Refund request submitted", refundStatus: "requested" });
  });

  router.post("/orders/:id/disputes", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid order id" });
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10 || reason.length > 1000) return res.status(400).json({ error: "bad_request", message: "Dispute details must be 10-1000 characters" });
    const order = await req.app.locals.marketplaceOrderCollection.findOne({
      _id: new ObjectId(req.params.id),
      $or: [{ buyerId: user.uid }, { sellerId: user.uid }],
    });
    if (!order) return res.status(404).json({ error: "not_found", message: "Order not found" });
    if (["pending", "cancelled"].includes(order.status)) return res.status(409).json({ error: "not_disputable", message: "This order is not eligible for a dispute" });
    const existing = await req.app.locals.orderDisputeCollection.findOne({ orderId: req.params.id, status: { $in: ["open", "under_review"] } });
    if (existing) return res.status(409).json({ error: "dispute_exists", message: "An active dispute already exists for this order" });
    const now = new Date();
    const dispute = {
      orderId: req.params.id,
      productId: order.productId,
      openedBy: user.uid,
      openedByRole: order.buyerId === user.uid ? "buyer" : "seller",
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      reason,
      status: "open",
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const result = await req.app.locals.orderDisputeCollection.insertOne(dispute);
    await req.app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id },
      { $set: { disputeStatus: "open", activeDisputeId: result.insertedId.toString(), updatedAt: now } },
    );
    const counterpartId = order.buyerId === user.uid ? order.sellerId : order.buyerId;
    await createNotification(req.app, { userId: counterpartId, type: "order_dispute", title: "Order dispute opened", message: `A dispute was opened for ${order.productTitle}. An administrator will review it.`, relatedId: req.params.id, image: order.productImage });
    return res.status(201).json({ message: "Dispute opened", dispute: serialize({ ...dispute, _id: result.insertedId }) });
  });

  router.get("/orders/:id/disputes", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid order id" });
    const order = await req.app.locals.marketplaceOrderCollection.findOne({
      _id: new ObjectId(req.params.id),
      $or: [{ buyerId: user.uid }, { sellerId: user.uid }],
    });
    if (!order) return res.status(404).json({ error: "not_found", message: "Order not found" });
    const disputes = await req.app.locals.orderDisputeCollection.find({ orderId: req.params.id }).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ disputes: disputes.map(serialize) });
  });

  router.get("/saved", async (req, res) => {
    const user = await resolveCurrentUser(req); if (!user) return res.status(200).json({ products: [] });
    const favorites = await req.app.locals.favoriteCollection.find({ userId: user.uid }).sort({ createdAt: -1 }).toArray();
    const ids = favorites.map((item: any) => item.productId).filter(ObjectId.isValid).map((id: string) => new ObjectId(id));
    const products = ids.length ? await req.app.locals.productCollection.find({ _id: { $in: ids }, hidden: { $ne: true } }).toArray() : [];
    return res.status(200).json({ products: products.map(withResolvedPiPrice).map(serialize) });
  });

  router.post("/products/:id/favorite", async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    const existing = await req.app.locals.favoriteCollection.findOne({ userId: user.uid, productId: req.params.id });
    if (existing) {
      await req.app.locals.favoriteCollection.deleteOne({ _id: existing._id });
      return res.status(200).json({ saved: false });
    }
    await req.app.locals.favoriteCollection.insertOne({ userId: user.uid, productId: req.params.id, createdAt: new Date() });
    return res.status(201).json({ saved: true });
  });

  router.get("/sellers/:id", async (req, res) => {
    const seller = await req.app.locals.userCollection.findOne({ uid: req.params.id });
    if (!seller) return res.status(404).json({ error: "not_found", message: "Seller not found" });
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(40, Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20));
    const search = String(req.query.search || "").trim().slice(0, 80);
    const category = String(req.query.category || "").trim().slice(0, 50);
    const sort = String(req.query.sort || "newest");
    const productQuery: Record<string, unknown> = { sellerId: seller.uid, hidden: { $ne: true }, active: true, approved: true, reviewStatus: "approved" };
    if (search) productQuery.$or = ["title", "description", "category"].map((field) => ({ [field]: { $regex: escapeRegex(search), $options: "i" } }));
    if (category) productQuery.category = category;
    const productSort = sort === "oldest" ? { createdAt: 1 } : sort === "price_low" ? { priceUsdt: 1 } : sort === "price_high" ? { priceUsdt: -1 } : { createdAt: -1 };
    const [products, filteredProducts, reviews, completedOrders, totalProducts] = await Promise.all([
      req.app.locals.productCollection.find(productQuery).sort(productSort).skip((page - 1) * limit).limit(limit).toArray(),
      req.app.locals.productCollection.countDocuments(productQuery),
      req.app.locals.reviewCollection.find({ sellerId: seller.uid }).sort({ createdAt: -1 }).toArray(),
      req.app.locals.marketplaceOrderCollection.countDocuments({ sellerId: seller.uid, status: "completed" }),
      req.app.locals.productCollection.countDocuments({ sellerId: seller.uid, hidden: { $ne: true }, active: true, approved: true, reviewStatus: "approved" }),
    ]);
    const averageRating = reviews.length ? reviews.reduce((sum: number, review: any) => sum + Number(review.rating), 0) / reviews.length : 0;
    return res.status(200).json({ seller: { uid: seller.uid, displayName: seller.displayName, piUsername: seller.piUsername, avatar: seller.avatar || "", country: seller.country, verificationLevel: publicVerificationLevel(seller), verificationStatus: verificationStatus(seller), createdAt: seller.createdAt, totalProducts, successfulOrders: completedOrders, averageRating, reviewCount: reviews.length }, products: products.map(withResolvedPiPrice).map(serialize), reviews: reviews.map(serialize), pagination: { page, limit, total: filteredProducts, hasMore: page * limit < filteredProducts } });
  });

  router.post("/orders/:id/review", async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid order id" });
    const order = await req.app.locals.marketplaceOrderCollection.findOne({ _id: new ObjectId(req.params.id), buyerId: user.uid, status: { $in: ["delivered", "completed"] } });
    if (!order) return res.status(404).json({ error: "not_found", message: "Delivered or completed order not found" });
    const rating = Number(req.body?.rating); const review = String(req.body?.message || req.body?.review || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || review.length > 300) return res.status(400).json({ error: "bad_request", message: "Rating must be 1-5 stars" });
    await req.app.locals.reviewCollection.updateOne(
      { orderId: req.params.id },
      {
        $set: { rating, message: review, updatedAt: new Date() },
        $setOnInsert: { orderId: req.params.id, sellerId: order.sellerId, buyerId: user.uid, buyerName: user.displayName || user.username, createdAt: new Date() },
      },
      { upsert: true }
    );
    return res.status(201).json({ message: "Seller review saved" });
  });

  router.get("/seller", async (req, res) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(200).json({ products: [], orders: [], stats: { totalProducts: 0, totalOrders: 0, pendingOrders: 0, paidOrders: 0, averageRating: 0, totalReviews: 0 } });
    const products = await req.app.locals.productCollection.find({ sellerId: user.uid }).sort({ createdAt: -1 }).toArray();
    const orders = await req.app.locals.marketplaceOrderCollection.find({ sellerId: user.uid }).sort({ createdAt: -1 }).toArray();
    const reviews = await req.app.locals.reviewCollection.find({ sellerId: user.uid }).toArray();
    const enrichedOrders = await enrichOrdersWithProductPrices(req, orders);
    const averageRating = reviews.length ? reviews.reduce((sum: number, review: any) => sum + Number(review.rating || 0), 0) / reviews.length : 0;
    return res.status(200).json({
      products: products.map(withResolvedPiPrice).map(serialize),
      orders: enrichedOrders.map(serialize),
      stats: {
        totalProducts: products.length,
        totalOrders: orders.length,
        pendingOrders: orders.filter((order: any) => order.status === "pending").length,
        paidOrders: orders.filter((order: any) => ["paid", "completed"].includes(order.status)).length,
        averageRating,
        totalReviews: reviews.length,
      },
    });
  });

  router.get("/seller/products/:id", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(req.params.id), sellerId: user.uid });
    if (!product) return res.status(404).json({ error: "not_found", message: "Product not found" });
    const [seller, related, favorite] = await Promise.all([
      req.app.locals.userCollection.findOne({ uid: product.sellerId }),
      req.app.locals.productCollection.find({ category: product.category, _id: { $ne: product._id }, active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" }).sort({ createdAt: -1 }).limit(6).toArray(),
      req.app.locals.favoriteCollection.findOne({ userId: user.uid, productId: req.params.id }),
    ]);
    return res.status(200).json({ product: serialize(withResolvedPiPrice(product)), seller: seller ? { uid: seller.uid, displayName: seller.displayName, piUsername: seller.piUsername, avatar: seller.avatar || "", country: seller.country, verificationLevel: publicVerificationLevel(seller), verificationStatus: verificationStatus(seller), createdAt: seller.createdAt } : null, related: related.map(withResolvedPiPrice).map(serialize), saved: Boolean(favorite) });
  });

  router.put("/seller/products/:id", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    const fields = productFields(req.body);
    const validationMessage = productValidationMessage(fields);
    if (validationMessage || !validProduct(fields)) return res.status(400).json({ error: "bad_request", message: validationMessage || "Complete all required product fields" });
    let resolvedFields: Awaited<ReturnType<typeof resolveProductImageFields>>;
    try {
      resolvedFields = await resolveProductImageFields(fields);
    } catch (err: any) {
      if (err?.statusCode === 413) return res.status(413).json({ error: "payload_too_large", message: err.message });
      if (err?.statusCode === 400 || err?.statusCode === 503) return res.status(err.statusCode).json({ error: "image_upload_failed", message: err.message });
      console.error("Product image upload failed:", err);
      return res.status(500).json({ error: "image_upload_failed", message: "Product image upload failed." });
    }
    const autoApprove = env.marketplace_auto_approve_products;
    const updates = { ...resolvedFields, active: resolvedFields.productStatus !== "out_of_stock" && resolvedFields.productStatus !== "draft", approved: resolvedFields.productStatus === "draft" ? false : autoApprove, reviewStatus: resolvedFields.productStatus === "draft" ? "pending" : autoApprove ? "approved" : "pending", rejectionReason: "", hidden: resolvedFields.productStatus === "hidden", updatedAt: new Date() };
    assertNoBase64Images(updates, "product");
    const result = await req.app.locals.productCollection.updateOne(
      { _id: new ObjectId(req.params.id), sellerId: user.uid },
      { $set: updates },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "not_found", message: "Product not found" });
    const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(req.params.id) });
    return res.status(200).json({ product: serialize(product) });
  });

  router.patch("/seller/products/:id/availability", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id) || typeof req.body?.active !== "boolean") {
      return res.status(400).json({ error: "bad_request", message: "Invalid availability update" });
    }
    const result = await req.app.locals.productCollection.updateOne(
      { _id: new ObjectId(req.params.id), sellerId: user.uid },
      { $set: { active: req.body.active, updatedAt: new Date() } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "not_found", message: "Product not found" });
    return res.status(200).json({ message: req.body.active ? "Product is available" : "Product is sold out" });
  });

  router.delete("/seller/products/:id", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    const result = await req.app.locals.productCollection.deleteOne({ _id: new ObjectId(req.params.id), sellerId: user.uid });
    if (!result.deletedCount) return res.status(404).json({ error: "not_found", message: "Product not found" });
    return res.status(200).json({ message: "Product deleted" });
  });
}
