import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { resolveCurrentUser } from "../services/auth";
import { createNotification } from "../services/notifications";
import { platformAPIKeyClient } from "../services/platformAPIClient";
import { verifyAccountIncomingPayment, bindPayment } from "../services/financialIntegrity";
import { PI_USDT_RATE, piFromUsdt } from "../services/piPricing";
import env from "../environments";
import axios from "axios";

const TIMELINE = (status: string, label: string, note?: string) => ({
  status,
  label,
  note,
  at: new Date().toISOString(),
});

const requireUser = async (req: Request, res: Response) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    return null;
  }
  return currentUser;
};

const VALID_RIDE_STATUSES = ["requested", "driver_assigned", "driver_on_the_way", "in_progress", "completed", "cancelled"] as const;
type RideStatus = typeof VALID_RIDE_STATUSES[number];

const VALID_BOOKING_STATUSES = ["pending", "confirmed", "active", "completed", "cancelled"] as const;
type BookingStatus = typeof VALID_BOOKING_STATUSES[number];

const VALID_PAYMENT_STATUSES = ["pending", "paid", "failed", "cancelled"] as const;
type PaymentStatus = typeof VALID_PAYMENT_STATUSES[number];

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

const objectOrPublicId = (value: string, publicField: string) =>
  ObjectId.isValid(value) ? { _id: new ObjectId(value) } : { [publicField]: value };

const RIDE_USD_PER_KM: Record<string, number> = {
  bike: 1.8,
  economy: 3.6,
  comfort: 5.2,
  delivery: 4.4,
};

export default function mountTransportEndpoints(router: Router) {
  router.get("/places/autocomplete", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const input = String(req.query.input || "").trim().slice(0, 160);
    if (input.length < 3) return res.status(200).json({ suggestions: [] });
    if (!env.google_maps_api_key) return res.status(503).json({ error: "places_unavailable", message: "Address search is not configured" });
    try {
      const response = await axios.post("https://places.googleapis.com/v1/places:autocomplete", { input, sessionToken: String(req.query.sessionToken || "").trim().slice(0, 64) || undefined }, { headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.google_maps_api_key, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" }, timeout: 8000 });
      const suggestions = (response.data?.suggestions || []).slice(0, 5).flatMap((item: any) => {
        const prediction = item.placePrediction;
        return prediction?.placeId && prediction?.text?.text ? [{ placeId: prediction.placeId, label: prediction.structuredFormat?.mainText?.text || prediction.text.text, description: prediction.structuredFormat?.secondaryText?.text || prediction.text.text }] : [];
      });
      return res.status(200).json({ suggestions });
    } catch { return res.status(502).json({ error: "places_failed", message: "Address search is temporarily unavailable" }); }
  });

  router.get("/places/:placeId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const placeId = String(req.params.placeId || "").trim();
    if (!placeId || placeId.length > 256) return res.status(400).json({ error: "bad_request", message: "Invalid place" });
    if (!env.google_maps_api_key) return res.status(503).json({ error: "places_unavailable", message: "Address search is not configured" });
    try {
      const response = await axios.get(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": env.google_maps_api_key, "X-Goog-FieldMask": "id,displayName,formattedAddress,location" }, params: { sessionToken: String(req.query.sessionToken || "").trim().slice(0, 64) || undefined }, timeout: 8000 });
      const place = response.data;
      return res.status(200).json({ place: { placeId: place.id, label: place.formattedAddress || place.displayName?.text || "Selected destination", lat: place.location?.latitude, lng: place.location?.longitude } });
    } catch { return res.status(502).json({ error: "places_failed", message: "Could not load that address" }); }
  });

  router.get("/bookings", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const type = String(req.query.type || "").trim();
    const status = String(req.query.status || "").trim();
    const query: Record<string, any> = { userId: user.uid };
    if (type && ["ride", "flight"].includes(type)) query.type = type;
    if (status && VALID_BOOKING_STATUSES.includes(status as BookingStatus)) query.status = status;
    const bookings = await req.app.locals.transportBookingCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return res.status(200).json({ bookings: bookings.map((b: any) => ({ ...b, _id: b._id.toString() })) });
  });

  router.get("/bookings/:id", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid booking id" });
    }
    const booking = await req.app.locals.transportBookingCollection.findOne({
      _id: new ObjectId(req.params.id),
      userId: user.uid,
    });
    if (!booking) {
      return res.status(404).json({ error: "not_found", message: "Booking not found" });
    }
    return res.status(200).json({ booking: { ...booking, _id: booking._id.toString() } });
  });

  router.post("/bookings/ride", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { pickup, destination, destinationLocation, vehicleType, etaMinutes, distanceKm, durationMin, scheduledPickupAt } = req.body || {};
    if (!pickup || !destination) {
      return res.status(400).json({ error: "bad_request", message: "Pickup and destination are required" });
    }
    const scheduledDate = scheduledPickupAt ? new Date(scheduledPickupAt) : null;
    if (scheduledDate && (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() + 5 * 60_000 || scheduledDate.getTime() > Date.now() + 30 * 24 * 60 * 60_000)) {
      return res.status(400).json({ error: "bad_request", message: "Scheduled pickup must be between 5 minutes and 30 days from now" });
    }
    const isScheduled = Boolean(scheduledDate);
    const bookingId = generateId("RIDE");
    const normalizedVehicleType = String(vehicleType || "economy");
    const normalizedDistance = Math.max(1, Math.min(250, Number(distanceKm) || 1));
    const fareUsd = Number(((RIDE_USD_PER_KM[normalizedVehicleType] || RIDE_USD_PER_KM.economy) * normalizedDistance).toFixed(2));
    const driver = isScheduled ? null : await req.app.locals.transportDriverCollection.findOne(
      { isOnline: true, isApproved: true },
      { sort: { updatedAt: -1 } },
    );
    const tripId = generateId("TRIP");
    const tripStatus = driver ? "driver_assigned" : "requested";
    const booking: any = {
      bookingId, userId: user.uid,
      userName: user.displayName || user.piUsername || user.username,
      userEmail: user.contactEmail || user.piUsername || user.username || "",
      type: "ride", status: driver ? "active" : "pending", paymentStatus: "pending",
      paymentId: null, paymentTxid: null, providerRef: null,
      farePi: piFromUsdt(fareUsd), fareUsd, piRateUsed: PI_USDT_RATE, currency: "PI",
      pickup, destination, scheduledPickupAt: scheduledDate, vehicleType: normalizedVehicleType,
      vehicleName: driver?.vehicleName || "", vehiclePlate: driver?.vehiclePlate || "",
      driverId: driver?.driverId || null, driverName: driver?.displayName || null,
      etaMinutes: Number(etaMinutes) || 0, distanceKm: normalizedDistance,
      durationMin: Number(durationMin) || 0, createdAt: new Date(), updatedAt: new Date(),
      timeline: [TIMELINE("pending", isScheduled ? "Ride Scheduled" : "Ride Requested", isScheduled ? `Pickup scheduled for ${scheduledDate?.toISOString()}.` : `Ride from ${pickup} to ${destination} has been requested.`)],
    };
    const result = await req.app.locals.transportBookingCollection.insertOne(booking);
    const trip: any = {
      tripId, userId: user.uid, bookingId, bookingObjectId: result.insertedId.toString(),
      driverId: driver?.driverId || "", driverName: driver?.displayName || "",
      pickup, destination, scheduledPickupAt: scheduledDate, vehicleType: normalizedVehicleType,
      vehicleName: driver?.vehicleName || "", vehiclePlate: driver?.vehiclePlate || "",
      status: tripStatus, farePi: booking.farePi, fareUsd, distanceKm: normalizedDistance,
      durationMin: Number(durationMin) || 0, pickupLocation: null,
      destinationLocation: Number.isFinite(Number(destinationLocation?.lat)) && Number.isFinite(Number(destinationLocation?.lng))
        ? { lat: Number(destinationLocation.lat), lng: Number(destinationLocation.lng), address: String(destinationLocation.address || destination) }
        : null,
      routePolyline: null, timeline: [TIMELINE(tripStatus, driver ? "Driver Assigned" : isScheduled ? "Ride Scheduled" : "Ride Requested")],
      createdAt: new Date(), updatedAt: new Date(), completedAt: null,
    };
    const tripResult = await req.app.locals.transportTripCollection.insertOne(trip);
    await createNotification(req.app, {
      userId: user.uid, type: driver ? "driver_assigned" : "ride_requested",
      title: driver ? "Driver assigned" : isScheduled ? "Ride scheduled" : "Ride requested",
      message: driver ? `${driver.displayName} has been assigned to your ride.` : isScheduled ? `Pickup scheduled for ${scheduledDate?.toLocaleString()}.` : "Your ride is waiting for a driver.",
      relatedId: result.insertedId.toString(), image: "",
    });
    return res.status(201).json({
      booking: { ...booking, _id: result.insertedId.toString() },
      trip: { ...trip, _id: tripResult.insertedId.toString() },
    });
  });

  router.post("/bookings/flight", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const {
      airline, flightCode, departureAirport, arrivalAirport,
      departureTime, arrivalTime, duration, cabin, seat, baggage,
      passengerName, passengerEmail, passengerNationality,
      fareUsd,
    } = req.body || {};
    if (!airline || !flightCode || !departureAirport || !arrivalAirport || !departureTime || !passengerName || !passengerEmail) {
      return res.status(400).json({ error: "bad_request", message: "Required flight fields are missing" });
    }
    const bookingId = generateId("FLT");
    const booking: any = {
      bookingId,
      userId: user.uid,
      userName: user.displayName || user.piUsername || user.username,
      userEmail: user.contactEmail || user.piUsername || user.username || "",
      type: "flight",
      status: "pending",
      paymentStatus: "pending",
      paymentId: null,
      paymentTxid: null,
      providerRef: null,
      farePi: piFromUsdt(fareUsd),
      fareUsd: Number(fareUsd) || 0,
      piRateUsed: PI_USDT_RATE,
      currency: "PI",
      airline,
      flightCode,
      departureAirport,
      arrivalAirport,
      departureTime,
      arrivalTime,
      duration,
      cabin,
      seat,
      baggage,
      passengerName,
      passengerEmail,
      passengerNationality,
      ticketNumber: null,
      eTicketUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      timeline: [
        TIMELINE("pending", "Flight Reserved", `Flight ${flightCode} is reserved for ${passengerName} pending payment.`),
        TIMELINE("payment_pending", "Payment Pending", "Complete Pi payment to confirm your flight."),
      ],
    };
    const result = await req.app.locals.transportBookingCollection.insertOne(booking);
    await createNotification(req.app, {
      userId: user.uid,
      type: "flight_payment_pending",
      title: "Flight reserved",
      message: `Complete Pi payment to issue your ticket for ${flightCode}.`,
      relatedId: result.insertedId.toString(),
      image: "",
    });
    return res.status(201).json({ booking: { ...booking, _id: result.insertedId.toString() } });
  });

  router.patch("/bookings/:id/status", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid booking id" });
    }
    const { status, paymentStatus, paymentId, paymentTxid } = req.body || {};
    const booking = await req.app.locals.transportBookingCollection.findOne({
      _id: new ObjectId(req.params.id),
      userId: user.uid,
    });
    if (!booking) {
      return res.status(404).json({ error: "not_found", message: "Booking not found" });
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    const timeline = Array.isArray(booking.timeline) ? booking.timeline : [];
    if (status && VALID_BOOKING_STATUSES.includes(status as BookingStatus) && status !== booking.status) {
      updates.status = status;
      const label = status.charAt(0).toUpperCase() + status.slice(1);
      timeline.push(TIMELINE(status, label, `Booking status changed to ${status}.`));
    }
    if (paymentStatus && VALID_PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus) && paymentStatus !== booking.paymentStatus) {
      updates.paymentStatus = paymentStatus;
      timeline.push(TIMELINE(paymentStatus, "Payment Updated", `Payment status changed to ${paymentStatus}.`));
    }
    if (paymentId) { updates.paymentId = paymentId; }
    if (paymentTxid) { updates.paymentTxid = paymentTxid; }
    if (status === "confirmed" || status === "active") {
      updates.providerRef = booking.providerRef || generateId("PROV");
    }
    updates.timeline = timeline;
    await req.app.locals.transportBookingCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updates },
    );
    return res.status(200).json({ message: "Booking updated", bookingId: booking.bookingId });
  });

  router.post("/bookings/:id/payment/approve", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { paymentId } = req.body || {};
    if (!paymentId) return res.status(400).json({ error: "bad_request", message: "paymentId is required" });
    const booking = await req.app.locals.transportBookingCollection.findOne({
      ...objectOrPublicId(req.params.id, "bookingId"), userId: user.uid, type: "flight",
    });
    if (!booking) return res.status(404).json({ error: "not_found", message: "Flight booking not found" });
    if (!booking.providerRef) {
      return res.status(409).json({ error: "inventory_not_live", message: "This flight is demo inventory and cannot accept payment" });
    }
    if (booking.status !== "pending" || !["pending", "processing"].includes(booking.paymentStatus)) {
      return res.status(409).json({ error: "invalid_state", message: "This flight is not awaiting payment" });
    }
    try {
      const remote = await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(paymentId)}`);
      const payment = remote.data;
      await verifyAccountIncomingPayment(req.app.locals, payment, { paymentId, payer: user.uid, amount: Number(booking.farePi), metadataKey: "bookingId", intentId: booking.bookingId });
      if (booking.paymentId && booking.paymentId !== paymentId) return res.status(409).json({ error: "payment_conflict", message: "Resume the bound flight payment" });
      await bindPayment(req.app, payment, "transport:" + booking.bookingId);
      const metadataBookingId = payment?.metadata?.bookingId;
      if (metadataBookingId !== booking.bookingId || Math.abs(Number(payment?.amount) - Number(booking.farePi)) > 0.000001) {
        return res.status(400).json({ error: "payment_mismatch", message: "Pi payment does not match this flight booking" });
      }
      await platformAPIKeyClient.post(`/v2/payments/${encodeURIComponent(paymentId)}/approve`);
      await req.app.locals.transportBookingCollection.updateOne(
        { _id: booking._id },
        { $set: { paymentId, paymentStatus: "processing", updatedAt: new Date() } },
      );
      return res.status(200).json({ message: "Flight payment approved", paymentId });
    } catch (error: any) {
      return res.status(error?.response?.status || 502).json({ error: "pi_approval_failed", message: "Pi could not approve this flight payment" });
    }
  });

  router.post("/bookings/:id/payment/complete", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { paymentId, txid } = req.body || {};
    if (!paymentId || !txid) return res.status(400).json({ error: "bad_request", message: "paymentId and txid are required" });
    const booking = await req.app.locals.transportBookingCollection.findOne({
      ...objectOrPublicId(req.params.id, "bookingId"), userId: user.uid, type: "flight",
    });
    if (!booking) return res.status(404).json({ error: "not_found", message: "Flight booking not found" });
    if (!booking.providerRef) {
      return res.status(409).json({ error: "inventory_not_live", message: "This flight is demo inventory and cannot accept payment" });
    }
    if (!booking.paymentId || booking.paymentId !== paymentId) {
      return res.status(409).json({ error: "payment_mismatch", message: "Payment identifier does not match" });
    }
    try {
      const payment = (await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(paymentId)}`)).data;
      await verifyAccountIncomingPayment(req.app.locals, payment, { paymentId, payer: user.uid, amount: Number(booking.farePi), metadataKey: "bookingId", intentId: booking.bookingId });
      await platformAPIKeyClient.post(`/v2/payments/${encodeURIComponent(paymentId)}/complete`, { txid });
      const confirmed = (await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(paymentId)}`)).data;
      await verifyAccountIncomingPayment(req.app.locals, confirmed, { paymentId, payer: user.uid, amount: Number(booking.farePi), metadataKey: "bookingId", intentId: booking.bookingId }, true, txid);
      await bindPayment(req.app, confirmed, "transport:" + booking.bookingId);
      const ticketNumber = booking.ticketNumber || `SMJ-${Date.now().toString(36).toUpperCase()}`;
      const timeline = [...(Array.isArray(booking.timeline) ? booking.timeline : []), TIMELINE("confirmed", "Ticket Issued", "Pi payment confirmed and electronic ticket issued.")];
      await req.app.locals.transportBookingCollection.updateOne(
        { _id: booking._id },
        { $set: { status: "confirmed", paymentStatus: "paid", paymentId, paymentTxid: txid, ticketNumber, eTicketUrl: `/services/transport/flights/ticket/${booking.bookingId}`, timeline, updatedAt: new Date() } },
      );
      await createNotification(req.app, {
        userId: user.uid, type: "flight_booked", title: "Flight ticket issued",
        message: `Ticket ${ticketNumber} for ${booking.flightCode} is ready.`, relatedId: booking._id.toString(), image: "",
      });
      return res.status(200).json({ booking: { ...booking, status: "confirmed", paymentStatus: "paid", paymentId, paymentTxid: txid, ticketNumber, eTicketUrl: `/services/transport/flights/ticket/${booking.bookingId}` } });
    } catch (error: any) {
      return res.status(error?.response?.status || 502).json({ error: "pi_completion_failed", message: "Pi could not complete this flight payment" });
    }
  });

  router.post("/bookings/:id/payment/cancel", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { paymentId } = req.body || {};
    const booking = await req.app.locals.transportBookingCollection.findOne({
      ...objectOrPublicId(req.params.id, "bookingId"), userId: user.uid, type: "flight",
    });
    if (!booking) return res.status(404).json({ error: "not_found", message: "Flight booking not found" });
    if (!booking.providerRef) {
      return res.status(409).json({ error: "inventory_not_live", message: "This flight is demo inventory and cannot accept payment" });
    }
    await req.app.locals.transportBookingCollection.updateOne(
      { _id: booking._id }, { $set: { paymentId: paymentId || booking.paymentId, paymentStatus: "cancelled", updatedAt: new Date() } },
    );
    return res.status(200).json({ message: "Flight payment cancelled" });
  });
  router.post("/bookings/:id/cancel", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const booking = await req.app.locals.transportBookingCollection.findOne({
      ...objectOrPublicId(req.params.id, "bookingId"),
      userId: user.uid,
    });
    if (!booking) {
      return res.status(404).json({ error: "not_found", message: "Booking not found" });
    }
    if (booking.status === "completed" || booking.status === "cancelled") {
      return res.status(400).json({ error: "bad_request", message: `Cannot cancel a ${booking.status} booking` });
    }
    const timeline = Array.isArray(booking.timeline) ? booking.timeline : [];
    timeline.push(TIMELINE("cancelled", "Cancelled", "The booking has been cancelled by the user."));
    await req.app.locals.transportBookingCollection.updateOne(
      { _id: booking._id },
      { $set: { status: "cancelled", paymentStatus: "cancelled", updatedAt: new Date(), timeline } },
    );
    await req.app.locals.transportTripCollection.updateOne(
      { bookingId: booking.bookingId, userId: user.uid },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );
    await createNotification(req.app, {
      userId: user.uid,
      type: booking.type === "flight" ? "flight_cancelled" : "trip_cancelled",
      title: booking.type === "flight" ? "Flight cancelled" : "Ride cancelled",
      message: `${booking.type === "flight" ? "Flight" : "Ride"} booking ${booking.bookingId} has been cancelled.`,
      relatedId: booking._id.toString(),
      image: "",
    });
    return res.status(200).json({ message: "Booking cancelled", bookingId: booking.bookingId });
  });

  router.get("/trips", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const trips = await req.app.locals.transportTripCollection
      .find({ userId: user.uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return res.status(200).json({ trips: trips.map((t: any) => ({ ...t, _id: t._id.toString() })) });
  });

  router.get("/trips/:id", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid trip id" });
    }
    const trip = await req.app.locals.transportTripCollection.findOne({
      _id: new ObjectId(req.params.id),
      userId: user.uid,
    });
    if (!trip) {
      return res.status(404).json({ error: "not_found", message: "Trip not found" });
    }
    return res.status(200).json({ trip: { ...trip, _id: trip._id.toString() } });
  });

  router.patch("/trips/:id/status", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { status } = req.body || {};
    if (!status || !["requested", "driver_assigned", "driver_on_the_way", "in_progress", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid trip status" });
    }
    const trip = await req.app.locals.transportTripCollection.findOne({
      ...objectOrPublicId(req.params.id, "tripId"),
      userId: user.uid,
    });
    if (!trip) {
      return res.status(404).json({ error: "not_found", message: "Trip not found" });
    }
    const timeline = Array.isArray(trip.timeline) ? trip.timeline : [];
    timeline.push(TIMELINE(status, status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()), `Trip status updated to ${status}.`));
    const updates: Record<string, any> = { status, updatedAt: new Date(), timeline };
    if (status === "completed") {
      updates.completedAt = new Date();
    }
    await req.app.locals.transportTripCollection.updateOne(
      { _id: trip._id },
      { $set: updates },
    );
    await req.app.locals.transportBookingCollection.updateOne(
      { bookingId: trip.bookingId, userId: user.uid },
      { $set: { status: status === "requested" ? "pending" : status === "completed" || status === "cancelled" ? status : "active", updatedAt: new Date() } },
    );
    if (status === "completed") {
      const existingReceipt = await req.app.locals.transportReceiptCollection.findOne({ tripId: trip.tripId });
      if (!existingReceipt) {
        await req.app.locals.transportReceiptCollection.insertOne({
          receiptId: generateId("RCT"), tripId: trip.tripId, bookingId: trip.bookingId,
          userId: user.uid, driverId: trip.driverId || "", driverName: trip.driverName || "",
          pickup: trip.pickup, destination: trip.destination, vehicleName: trip.vehicleName || "",
          vehiclePlate: trip.vehiclePlate || "", farePi: trip.farePi || 0, fareUsd: trip.fareUsd || 0,
          distanceKm: trip.distanceKm || 0, durationMin: trip.durationMin || 0,
          paymentStatus: "pending", paymentTxid: null, createdAt: new Date(),
        });
      }
    }
    return res.status(200).json({ message: `Trip marked as ${status}`, tripId: trip.tripId });
  });

  router.get("/drivers/nearby", async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radius) || 10;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "bad_request", message: "Valid lat and lng query parameters are required" });
    }
    const drivers = await req.app.locals.transportDriverCollection
      .find({
        isOnline: true,
        isApproved: true,
        currentLocation: { $exists: true, $ne: null },
      })
      .limit(50)
      .toArray();
    const nearby = drivers.filter((d: any) => {
      const dLat = d.currentLocation?.lat;
      const dLng = d.currentLocation?.lng;
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return false;
      const distance = Math.sqrt((lat - dLat) ** 2 + (lng - dLng) ** 2) * 111;
      return distance <= radiusKm;
    }).sort((a: any, b: any) => {
      const distA = Math.sqrt((lat - a.currentLocation.lat) ** 2 + (lng - a.currentLocation.lng) ** 2) * 111;
      const distB = Math.sqrt((lat - b.currentLocation.lat) ** 2 + (lng - b.currentLocation.lng) ** 2) * 111;
      return distA - distB;
    });
    return res.status(200).json({ drivers: nearby.map((d: any) => ({ ...d, _id: d._id.toString() })), count: nearby.length });
  });

  router.get("/drivers", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const drivers = await req.app.locals.transportDriverCollection
      .find({ userId: user.uid })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    return res.status(200).json({ drivers: drivers.map((d: any) => ({ ...d, _id: d._id.toString() })) });
  });

  router.post("/drivers", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { vehicleType, vehicleName, vehiclePlate, color, currentLocation } = req.body || {};
    if (!vehicleType || !vehicleName || !vehiclePlate) {
      return res.status(400).json({ error: "bad_request", message: "Vehicle type, name, and plate are required" });
    }
    const driverId = generateId("DRV");
    const driver: any = {
      driverId,
      userId: user.uid,
      displayName: user.displayName || user.piUsername || user.username,
      piUsername: user.piUsername || user.username,
      avatar: user.avatar || "",
      vehicleType,
      vehicleName,
      vehiclePlate,
      color: color || "#18a66a",
      rating: 0,
      totalTrips: 0,
      isOnline: false,
      currentLocation: currentLocation ? {
        lat: Number(currentLocation.lat) || 0,
        lng: Number(currentLocation.lng) || 0,
        address: String(currentLocation.address || ""),
      } : null,
      isVerified: false,
      isApproved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await req.app.locals.transportDriverCollection.insertOne(driver);
    await createNotification(req.app, {
      userId: user.uid,
      type: "driver_registered",
      title: "Driver profile created",
      message: `Your ${vehicleType} driver profile has been created and is pending review.`,
      relatedId: result.insertedId.toString(),
      image: "",
    });
    return res.status(201).json({ driver: { ...driver, _id: result.insertedId.toString() } });
  });

  router.patch("/drivers/:id/location", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid driver id" });
    }
    const { lat, lng, address } = req.body || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "bad_request", message: "Valid lat and lng are required" });
    }
    const driver = await req.app.locals.transportDriverCollection.findOne({
      _id: new ObjectId(req.params.id),
      userId: user.uid,
    });
    if (!driver) {
      return res.status(404).json({ error: "not_found", message: "Driver profile not found" });
    }
    await req.app.locals.transportDriverCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { currentLocation: { lat, lng, address: address || driver.currentLocation?.address || "" }, updatedAt: new Date() } },
    );
    return res.status(200).json({ message: "Location updated" });
  });

  router.patch("/drivers/:id/online", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid driver id" });
    }
    const { isOnline } = req.body || {};
    if (typeof isOnline !== "boolean") {
      return res.status(400).json({ error: "bad_request", message: "isOnline must be a boolean" });
    }
    const driver = await req.app.locals.transportDriverCollection.findOne({
      _id: new ObjectId(req.params.id),
      userId: user.uid,
    });
    if (!driver) {
      return res.status(404).json({ error: "not_found", message: "Driver profile not found" });
    }
    await req.app.locals.transportDriverCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isOnline, updatedAt: new Date() } },
    );
    return res.status(200).json({ message: `Driver is now ${isOnline ? "online" : "offline"}` });
  });

  router.get("/vehicles", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const vehicles = await req.app.locals.transportVehicleCollection
      .find({ userId: user.uid })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return res.status(200).json({ vehicles: vehicles.map((v: any) => ({ ...v, _id: v._id.toString() })) });
  });

  router.post("/vehicles", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { type, make, model, year, color, plate, capacity } = req.body || {};
    if (!type || !make || !model || !plate) {
      return res.status(400).json({ error: "bad_request", message: "Vehicle type, make, model, and plate are required" });
    }
    const vehicleId = generateId("VEH");
    const vehicle: any = {
      vehicleId,
      driverId: "",
      userId: user.uid,
      type,
      make,
      model,
      year: Number(year) || new Date().getFullYear(),
      color: color || "",
      plate,
      capacity: Number(capacity) || 4,
      isVerified: false,
      isApproved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await req.app.locals.transportVehicleCollection.insertOne(vehicle);
    await createNotification(req.app, {
      userId: user.uid,
      type: "vehicle_registered",
      title: "Vehicle registered",
      message: `Your ${make} ${model} (${plate}) has been registered and is pending review.`,
      relatedId: result.insertedId.toString(),
      image: "",
    });
    return res.status(201).json({ vehicle: { ...vehicle, _id: result.insertedId.toString() } });
  });

  router.get("/receipts", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const receipts = await req.app.locals.transportReceiptCollection
      .find({ userId: user.uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return res.status(200).json({ receipts: receipts.map((r: any) => ({ ...r, _id: r._id.toString() })) });
  });

  router.get("/receipts/:id", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid receipt id" });
    }
    const receipt = await req.app.locals.transportReceiptCollection.findOne({
      _id: new ObjectId(req.params.id),
      userId: user.uid,
    });
    if (!receipt) {
      return res.status(404).json({ error: "not_found", message: "Receipt not found" });
    }
    return res.status(200).json({ receipt: { ...receipt, _id: receipt._id.toString() } });
  });

  router.post("/notifications/transport", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { type, title, message, relatedId, image } = req.body || {};
    if (!type || !title || !message) {
      return res.status(400).json({ error: "bad_request", message: "type, title, and message are required" });
    }
    const notification: any = {
      userId: user.uid,
      type: String(type),
      title: String(title),
      message: String(message),
      relatedId: String(relatedId || ""),
      image: String(image || ""),
      read: false,
      createdAt: new Date(),
    };
    const result = await req.app.locals.transportNotificationCollection.insertOne(notification);
    return res.status(201).json({ notification: { ...notification, _id: result.insertedId.toString() } });
  });

  router.get("/notifications", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const notifications = await req.app.locals.transportNotificationCollection
      .find({ userId: user.uid })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return res.status(200).json({ notifications: notifications.map((n: any) => ({ ...n, _id: n._id.toString() })) });
  });

  router.patch("/notifications/:id/read", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid notification id" });
    }
    const notification = await req.app.locals.transportNotificationCollection.findOne({
      _id: new ObjectId(req.params.id),
      userId: user.uid,
    });
    if (!notification) {
      return res.status(404).json({ error: "not_found", message: "Notification not found" });
    }
    await req.app.locals.transportNotificationCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { read: true } },
    );
    return res.status(200).json({ message: "Notification marked as read" });
  });

  router.get("/admin/stats", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const isAdmin = user.role === "admin";
    if (!isAdmin) {
      return res.status(403).json({ error: "forbidden", message: "Admin access required" });
    }
    const [bookingCount, driverCount, vehicleCount, tripCount, pendingDrivers, activeTrips] = await Promise.all([
      req.app.locals.transportBookingCollection.countDocuments({}),
      req.app.locals.transportDriverCollection.countDocuments({}),
      req.app.locals.transportVehicleCollection.countDocuments({}),
      req.app.locals.transportTripCollection.countDocuments({}),
      req.app.locals.transportDriverCollection.countDocuments({ isApproved: false }),
      req.app.locals.transportTripCollection.countDocuments({ status: { $in: ["requested", "driver_assigned", "driver_on_the_way", "in_progress"] } }),
    ]);
    const bookings = await req.app.locals.transportBookingCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    const recentTrips = await req.app.locals.transportTripCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    return res.status(200).json({
      stats: { totalBookings: bookingCount, totalDrivers: driverCount, totalVehicles: vehicleCount, totalTrips: tripCount, pendingDrivers, activeTrips },
      recentBookings: bookings.map((b: any) => ({ ...b, _id: b._id.toString() })),
      recentTrips: recentTrips.map((t: any) => ({ ...t, _id: t._id.toString() })),
    });
  });
}
