import { Request, Response, Router } from "express";

const serialize = (banner: Record<string, any>) => ({ ...banner, _id: banner._id.toString() });

export default function mountHeroBannerEndpoints(router: Router) {
  router.get("/", async (req: Request, res: Response) => {
    const placement = String(req.query.placement || "");
    if (!["dashboard", "store"].includes(placement)) return res.status(400).json({ error: "bad_request", message: "Choose dashboard or store." });
    const collection = req.app.locals.heroBannerCollection;
    if (!collection) return res.status(503).json({ error: "service_unavailable", message: "Hero banner storage is still starting." });
    const banners = await collection.find({ placement, active: true, deleted: { $ne: true } }).sort({ order: 1 }).toArray();
    const managed = Boolean(await collection.findOne({ placement }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ banners: banners.map(serialize), managed });
  });
}
