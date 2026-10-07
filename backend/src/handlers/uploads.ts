import { Router, Request, Response } from "express";
import { isBase64Image, resolveImageValue, safePurpose, uploadImageToCloudinary, uploadPdfToCloudinary } from "../services/imageStorage";
import { resolveCurrentUser } from "../services/auth";

export default function mountUploadEndpoints(router: Router) {
  const uploadImageValue = async (image: string, purpose: string) => {
    if (!isBase64Image(image)) {
      const url = await resolveImageValue(image, purpose);
      if (url) return { url, storage: "existing" };
      return null;
    }
    return uploadImageToCloudinary(image, purpose);
  };

  router.post("/image", async (req: Request, res: Response) => {
    try {
      const purpose = safePurpose(req.body?.purpose), image = String(req.body?.image || req.body?.dataUrl || "");
      const institutionEvidence = purpose === "institution-authorization";
      const user = institutionEvidence ? await resolveCurrentUser(req) : null;
      if (institutionEvidence && !user) return res.status(401).json({ error: "authentication_required" });
      if (institutionEvidence && (!/^data:image\/(png|jpeg|webp);base64,/i.test(image) || Buffer.from(image.split(",")[1] || "", "base64").length > 5 * 1024 * 1024)) return res.status(400).json({ message: "Upload a JPG, PNG, or WebP authorization image up to 5 MB." });
      const upload = await uploadImageValue(image, purpose);
      if (!upload) return res.status(400).json({ error: "bad_request", message: "Upload a valid image file." });
      if (institutionEvidence && user) await req.app.locals.institutionEvidenceCollection.insertOne({ userId: String(user._id), url: upload.url, createdAt: new Date().toISOString() });
      return res.status(201).json(upload);
    } catch (err: any) {
      if (err?.statusCode === 413) return res.status(413).json({ error: "payload_too_large", message: err.message });
      if (err?.statusCode === 400) return res.status(400).json({ error: "bad_request", message: err.message });
      if (err?.statusCode === 503) return res.status(503).json({ error: "upload_unavailable", message: err.message });
      console.error("Image upload failed:", err);
      return res.status(500).json({ error: "upload_failed", message: "Image upload failed." });
    }
  });

  router.post("/images", async (req: Request, res: Response) => {
    try {
      const images: string[] = Array.isArray(req.body?.images) ? req.body.images.map((item: unknown) => String(item || "")).filter(Boolean).slice(0, 12) : [];
      if (!images.length) return res.status(400).json({ error: "bad_request", message: "Upload at least one image." });

      const uploads = await Promise.all(images.map((image) => uploadImageValue(image, safePurpose(req.body?.purpose))));
      if (uploads.some((upload) => !upload)) return res.status(400).json({ error: "bad_request", message: "Upload valid image files." });

      return res.status(201).json({ urls: uploads.map((upload) => upload!.url), uploads });
    } catch (err: any) {
      if (err?.statusCode === 413) return res.status(413).json({ error: "payload_too_large", message: err.message });
      if (err?.statusCode === 400) return res.status(400).json({ error: "bad_request", message: err.message });
      if (err?.statusCode === 503) return res.status(503).json({ error: "upload_unavailable", message: err.message });
      console.error("Image upload failed:", err);
      return res.status(500).json({ error: "upload_failed", message: "Image upload failed." });
    }
  });
  router.post("/document", async (req: Request, res: Response) => {
    try {
      const user = await resolveCurrentUser(req);
      if (!user) return res.status(401).json({ error: "authentication_required" });
      const institutionEvidence = safePurpose(req.body?.purpose) === "institution-authorization";
      if (institutionEvidence && Buffer.from(String(req.body?.document || "").split(",")[1] || "", "base64").length > 5 * 1024 * 1024) return res.status(400).json({ message: "Upload authorization evidence up to 5 MB." });
      const name = String(req.body?.name || "document.pdf").slice(0, 120);
      const upload = await uploadPdfToCloudinary(String(req.body?.document || ""), safePurpose(req.body?.purpose), name);
      if (institutionEvidence) await req.app.locals.institutionEvidenceCollection.insertOne({ userId: String(user._id), url: upload.url, createdAt: new Date().toISOString() });
      return res.status(201).json(upload);
    } catch (err: any) {
      if ([400, 413, 503].includes(err?.statusCode)) return res.status(err.statusCode).json({ error: "document_upload_failed", message: err.message });
      console.error("Document upload failed:", err);
      return res.status(500).json({ error: "document_upload_failed", message: "Document upload failed." });
    }
  });
}
