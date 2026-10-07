import type { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { resolveCurrentUser } from "../services/auth";
import env from "../environments";
import { piFromUsdt } from "../services/piPricing";
import { institutionTypes } from "../types/institutions";
import {
  text,
  list,
  secureUrl,
  institutionProfile,
  isInstitutionPartner,
  canManageInstitution,
  publicInstitution,
  grantInstitutionProgramCourses,
} from "../services/institutions";
const serialize = (row: any) =>
  row ? { ...row, id: String(row._id), _id: undefined } : null;
const id = (value: string) => {
  if (!ObjectId.isValid(value)) throw new Error("Invalid record id.");
  return new ObjectId(value);
};
const wrap =
  (handler: (req: Request, res: Response) => Promise<any>) =>
  async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (!res.headersSent)
        res
          .status(400)
          .json({
            message: error instanceof Error ? error.message : "Request failed.",
          });
    }
  };
async function userFor(req: Request, res: Response, admin = false) {
  const user = await resolveCurrentUser(req);
  if (!user) {
    res.status(401).json({ message: "Sign in first." });
    return null;
  }
  if (admin && user.role !== "admin") {
    res.status(403).json({ message: "SMAJ administrator access required." });
    return null;
  }
  return user;
}
async function managed(req: Request, res: Response) {
  const user = await userFor(req, res);
  if (!user) return null;
  const institutionId = req.params.institutionId;
  const institution = await req.app.locals.institutionCollection.findOne({
    _id: id(institutionId),
  });
  if (!institution || !(await canManageInstitution(req, user, institutionId))) {
    res
      .status(403)
      .json({ message: "You can only manage your own institution." });
    return null;
  }
  if (user.role !== "admin" && !isInstitutionPartner(institution)) {
    res.status(403).json({ message: "This institution portal is not active." });
    return null;
  }
  return { user, institution, institutionId };
}
async function audit(
  req: Request,
  user: any,
  action: string,
  institutionId: string,
  details: any = {},
) {
  await req.app.locals.institutionAuditCollection.insertOne({
    actorId: String(user._id),
    action,
    institutionId,
    details,
    at: new Date().toISOString(),
  });
}
const now = () => new Date().toISOString();
export default function mountInstitutionEndpoints(router: Router) {
  router.get("/institutions/config", (_, res) =>
    res.json({
      institutionTypes,
      deliveryModes: ["online", "physical", "hybrid"],
    }),
  );
  router.get(
    "/institutions",
    wrap(async (req, res) => {
      const query: any = { status: "active" };
      for (const key of [
        "institutionType",
        "country",
        "deliveryMode",
        "languages",
        "subjects",
        "categories",
      ])
        if (req.query[key]) query[key] = text(req.query[key], 100);
      if (req.query.partnerStatus === "smaj_verified_partner") {
        query.partnerStatus = "smaj_verified_partner";
        query.verificationStatus = "verified";
      }
      if (req.query.partnerStatus === "directory")
        query.$or = [
          { partnerStatus: "directory" },
          { verificationStatus: "unverified" },
        ];
      if (req.query.q) {
        const escaped = text(req.query.q, 100).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        query.$and = [
          {
            $or: [
              { name: { $regex: escaped, $options: "i" } },
              { description: { $regex: escaped, $options: "i" } },
              { subjects: { $regex: escaped, $options: "i" } },
            ],
          },
        ];
      }
      const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1)),
        limit = 20;
      const collection = req.app.locals.institutionCollection;
      const [rows, total] = await Promise.all([
        collection
          .find(query)
          .sort({ name: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ]);
      res.json({
        institutions: rows.map(publicInstitution),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }),
  );
  router.get(
    "/institution-applications/mine",
    wrap(async (req, res) => {
      const user = await userFor(req, res);
      if (!user) return;
      res.json({
        applications: (
          await req.app.locals.institutionApplicationCollection
            .find({ applicantId: String(user._id) })
            .sort({ updatedAt: -1 })
            .toArray()
        ).map(serialize),
      });
    }),
  );
  const applicationFields = (body: any) => {
    const profile = institutionProfile(
      body.profile || {},
      body.status === "draft",
    );
    const evidenceUrl = secureUrl(body.evidenceUrl);
    if (
      evidenceUrl &&
      (new URL(evidenceUrl).hostname !== "res.cloudinary.com" ||
        !new URL(evidenceUrl).pathname.startsWith(
          "/" + env.cloudinary_cloud_name + "/",
        ))
    )
      throw new Error(
        "Upload authorization evidence through SMAJ document or image storage.",
      );
    if (evidenceUrl && !/\.(pdf|png|jpe?g|webp)(\?|$)/i.test(evidenceUrl))
      throw new Error(
        "Authorization evidence must be an uploaded PDF, JPG, PNG, or WebP document.",
      );
    return {
      profile,
      applicantName: text(body.applicantName, 160),
      applicantRole: text(body.applicantRole, 160),
      evidenceUrl,
      piPaymentInterest: body.piPaymentInterest === true,
      additionalInformation: text(body.additionalInformation, 5000),
      programs: list(body.programs),
      courses: list(body.courses),
    };
  };
  const saveApplication = async (req: Request, res: Response) => {
    const user = await userFor(req, res);
    if (!user) return;
    const status = req.body.status === "draft" ? "draft" : "submitted";
    const fields = applicationFields(req.body);
    if (
      fields.evidenceUrl &&
      !(await req.app.locals.institutionEvidenceCollection.findOne({
        userId: String(user._id),
        url: fields.evidenceUrl,
      }))
    )
      throw new Error(
        "Upload your authorization evidence through this application form.",
      );
    if (
      status === "submitted" &&
      (!fields.applicantName ||
        !fields.applicantRole ||
        !fields.evidenceUrl ||
        !fields.profile.email)
    )
      throw new Error(
        "Applicant name, role, official email and authorization evidence are required.",
      );
    const collection = req.app.locals.institutionApplicationCollection;
    if (req.params.applicationId) {
      const existing = await collection.findOne({
        _id: id(req.params.applicationId),
        applicantId: String(user._id),
      });
      if (
        !existing ||
        !["draft", "needs_information"].includes(existing.status)
      ) {
        res
          .status(403)
          .json({
            message: "Only your drafts or information requests can be edited.",
          });
        return;
      }
      const changed = await collection.updateOne(
        {
          _id: existing._id,
          status: existing.status,
          reviewLock: { $exists: false },
        },
        { $set: { ...fields, status, updatedAt: now() } },
      );
      if (!changed.matchedCount)
        throw new Error(
          "The application is being reviewed. Reload before editing.",
        );
      res.json({
        application: serialize(await collection.findOne({ _id: existing._id })),
      });
    } else {
      const document = {
        ...fields,
        applicantId: String(user._id),
        status,
        createdAt: now(),
        updatedAt: now(),
      };
      const result = await collection.insertOne(document);
      res
        .status(201)
        .json({
          application: serialize({ ...document, _id: result.insertedId }),
        });
    }
  };
  router.post("/institution-applications", wrap(saveApplication));
  router.patch(
    "/institution-applications/:applicationId",
    wrap(saveApplication),
  );
  router.get(
    "/institution-portal",
    wrap(async (req, res) => {
      const user = await userFor(req, res);
      if (!user) return;
      const memberships = await req.app.locals.institutionAdminCollection
        .find({ userId: String(user._id), status: "active" })
        .toArray();
      const institutions = await req.app.locals.institutionCollection
        .find(
          user.role === "admin"
            ? {}
            : {
                _id: { $in: memberships.map((m: any) => id(m.institutionId)) },
              },
        )
        .toArray();
      res.json({
        institutions: institutions
          .filter(isInstitutionPartner)
          .map(publicInstitution),
      });
    }),
  );
  router.get(
    "/institution-portal/:institutionId",
    wrap(async (req, res) => {
      const access = await managed(req, res);
      if (!access) return;
      const { institutionId, institution } = access,
        locals = req.app.locals;
      const [
        programs,
        courses,
        applications,
        enrollments,
        payments,
        certificates,
        announcements,
        auditHistory,
      ] = await Promise.all([
        locals.institutionProgramCollection.find({ institutionId }).toArray(),
        locals.courseCollection.find({ institutionId }).toArray(),
        locals.institutionStudentApplicationCollection
          .find({ institutionId })
          .toArray(),
        locals.enrollmentCollection.find({ institutionId }).toArray(),
        locals.coursePaymentCollection.find({ institutionId }).toArray(),
        locals.certificateCollection.find({ institutionId }).toArray(),
        locals.institutionAnnouncementCollection
          .find({ institutionId })
          .sort({ createdAt: -1 })
          .toArray(),
        locals.institutionAuditCollection
          .find({ institutionId })
          .sort({ at: -1 })
          .limit(100)
          .toArray(),
      ]);
      res.json({
        institution: publicInstitution(institution),
        programs: programs.map(serialize),
        courses: courses.map(serialize),
        applications: applications.map(serialize),
        enrollments: enrollments.map(serialize),
        payments: payments.map(serialize),
        certificates: certificates.map(serialize),
        announcements: announcements.map(serialize),
        auditHistory: auditHistory.map(serialize),
        summary: {
          students: new Set(enrollments.map((e: any) => e.user_id)).size,
          activeEnrollments: enrollments.filter(
            (e: any) => e.status === "active",
          ).length,
          completedStudents: enrollments.filter(
            (e: any) => e.status === "completed",
          ).length,
          pendingApplications: applications.filter(
            (a: any) => a.status === "submitted",
          ).length,
          programs: programs.length,
          courses: courses.length,
          paidPi: payments
            .filter((p: any) => p.status === "paid")
            .reduce((sum: number, p: any) => sum + Number(p.amount_pi || 0), 0),
        },
      });
    }),
  );
  router.patch(
    "/institution-portal/:institutionId/profile",
    wrap(async (req, res) => {
      const access = await managed(req, res);
      if (!access) return;
      const fields = institutionProfile({ ...access.institution, ...req.body });
      await req.app.locals.institutionCollection.updateOne(
        { _id: access.institution._id },
        { $set: { ...fields, updatedAt: now() } },
      );
      await audit(
        req,
        access.user,
        "institution.profile_updated",
        access.institutionId,
      );
      res.json({
        institution: publicInstitution(
          await req.app.locals.institutionCollection.findOne({
            _id: access.institution._id,
          }),
        ),
      });
    }),
  );
  const saveProgram = async (req: Request, res: Response) => {
    const access = await managed(req, res);
    if (!access) return;
    const b = req.body,
      priceUsdt = Number(b.priceUsdt || 0);
    if (
      !Number.isFinite(priceUsdt) ||
      priceUsdt < 0 ||
      text(b.name, 160).length < 2
    )
      throw new Error(
        "A program name and valid nonnegative price are required.",
      );
    const courseIds = list(b.courseIds);
    for (const courseId of courseIds)
      if (
        !(await req.app.locals.courseCollection.findOne({
          _id: id(courseId),
          institutionId: access.institutionId,
        }))
      )
        throw new Error(
          "Programs can reference only this institution's courses.",
        );
    const existing = req.params.programId
      ? await req.app.locals.institutionProgramCollection.findOne({
          _id: id(req.params.programId),
          institutionId: access.institutionId,
        })
      : null;
    if (req.params.programId && !existing) {
      res.status(404).json({ message: "Program not found." });
      return;
    }
    const fields = {
      institutionId: access.institutionId,
      name: text(b.name, 160),
      description: text(b.description, 5000),
      courseIds,
      priceUsdt,
      pricePi: priceUsdt > 0 ? piFromUsdt(priceUsdt) : 0,
      learningUrl: secureUrl(b.learningUrl),
      learningInstructions: text(b.learningInstructions, 5000),
      status:
        access.user.role === "admin" &&
        ["approved", "archived"].includes(b.status)
          ? b.status
          : "draft",
      enrollmentEnabled: b.enrollmentEnabled === true,
      certificateEnabled: b.certificateEnabled === true,
      piPaymentsEnabled:
        access.user.role === "admin" && b.piPaymentsEnabled === true,
      updatedAt: now(),
    };
    let programId = existing?._id;
    if (existing)
      await req.app.locals.institutionProgramCollection.updateOne(
        { _id: programId },
        { $set: fields },
      );
    else
      programId = (
        await req.app.locals.institutionProgramCollection.insertOne({
          ...fields,
          createdAt: now(),
        })
      ).insertedId;
    await audit(req, access.user, "program.saved", access.institutionId, {
      programId: String(programId),
      status: fields.status,
    });
    res.json({
      program: serialize(
        await req.app.locals.institutionProgramCollection.findOne({
          _id: programId,
        }),
      ),
    });
  };
  router.post("/institution-portal/:institutionId/programs", wrap(saveProgram));
  router.patch(
    "/institution-portal/:institutionId/programs/:programId",
    wrap(saveProgram),
  );
  router.post(
    "/institution-portal/:institutionId/announcements",
    wrap(async (req, res) => {
      const access = await managed(req, res);
      if (!access) return;
      const title = text(req.body.title, 200),
        body = text(req.body.body, 5000);
      if (!title || !body)
        throw new Error("Announcement title and content are required.");
      const row = {
        institutionId: access.institutionId,
        title,
        body,
        createdAt: now(),
      };
      await req.app.locals.institutionAnnouncementCollection.insertOne(row);
      await audit(
        req,
        access.user,
        "announcement.created",
        access.institutionId,
      );
      res.status(201).json({ saved: true });
    }),
  );
  router.patch(
    "/institution-portal/:institutionId/applications/:applicationId",
    wrap(async (req, res) => {
      const access = await managed(req, res);
      if (!access) return;
      const status = req.body.status;
      if (
        !["under_review", "needs_information", "accepted", "rejected"].includes(
          status,
        )
      )
        throw new Error("Invalid admission application status.");
      const result =
        await req.app.locals.institutionStudentApplicationCollection.updateOne(
          {
            _id: id(req.params.applicationId),
            institutionId: access.institutionId,
          },
          {
            $set: {
              status,
              reviewNotes: text(req.body.reviewNotes, 2000),
              updatedAt: now(),
            },
          },
        );
      if (!result.matchedCount) {
        res.status(404).json({ message: "Application not found." });
        return;
      }
      await audit(
        req,
        access.user,
        "student_application.reviewed",
        access.institutionId,
        { status, applicationId: req.params.applicationId },
      );
      res.json({ updated: true });
    }),
  );
  router.patch(
    "/institution-portal/:institutionId/enrollments/:enrollmentId",
    wrap(async (req, res) => {
      const access = await managed(req, res);
      if (!access) return;
      const enrollment = await req.app.locals.enrollmentCollection.findOne({
        _id: id(req.params.enrollmentId),
        institutionId: access.institutionId,
      });
      if (
        !enrollment ||
        !enrollment.programId ||
        enrollment.status !== "active" ||
        req.body.status !== "completed"
      )
        throw new Error(
          "Only an active program enrollment can be marked completed.",
        );
      await req.app.locals.enrollmentCollection.updateOne(
        { _id: enrollment._id },
        {
          $set: {
            status: "completed",
            progress_percentage: 100,
            completed_at: now(),
            updated_at: now(),
          },
        },
      );
      await audit(
        req,
        access.user,
        "enrollment.completed",
        access.institutionId,
        { enrollmentId: req.params.enrollmentId },
      );
      res.json({ updated: true });
    }),
  );
  router.post(
    "/institution-portal/:institutionId/enrollments/:enrollmentId/certificate",
    wrap(async (req, res) => {
      const access = await managed(req, res);
      if (!access) return;
      if (
        !access.institution.capabilities?.certificates ||
        !isInstitutionPartner(access.institution)
      )
        throw new Error("Certificate issuing is not enabled.");
      const enrollment = await req.app.locals.enrollmentCollection.findOne({
        _id: id(req.params.enrollmentId),
        institutionId: access.institutionId,
        status: "completed",
      });
      if (!enrollment?.programId)
        throw new Error("A completed program enrollment is required.");
      const program = await req.app.locals.institutionProgramCollection.findOne(
        {
          _id: id(enrollment.programId),
          institutionId: access.institutionId,
          status: "approved",
          certificateEnabled: true,
        },
      );
      if (!program) throw new Error("Program certificates are not approved.");
      const existing = await req.app.locals.certificateCollection.findOne({
        enrollment_id: String(enrollment._id),
      });
      if (existing) {
        res.json({ certificate: serialize(existing) });
        return;
      }
      const learner = await req.app.locals.userCollection.findOne({
        _id: id(enrollment.user_id),
      });
      const certificateId =
        "SMAJ-INST-" + new ObjectId().toString().toUpperCase();
      const row = {
        certificate_id: certificateId,
        enrollment_id: String(enrollment._id),
        user_id: enrollment.user_id,
        institutionId: access.institutionId,
        programId: enrollment.programId,
        course_id: "",
        course_slug: "",
        course_title: program.name,
        instructor_name: access.institution.name,
        provider_name: access.institution.name,
        learner_name: learner?.displayName || learner?.username || "Learner",
        certificate_type: "completion",
        completion_date: enrollment.completed_at,
        issue_date: now(),
        status: "valid",
        verification_url:
          "https://smajpihub.com/verify/certificate/" + certificateId,
        created_at: now(),
        updated_at: now(),
      };
      const certKey = {
        enrollment_id: String(enrollment._id),
        institutionId: access.institutionId,
      };
      try {
        await req.app.locals.certificateCollection.updateOne(
          certKey,
          { $setOnInsert: row },
          { upsert: true },
        );
      } catch (error: any) {
        if (error.code !== 11000) throw error;
      }
      const saved = await req.app.locals.certificateCollection.findOne(certKey);
      await req.app.locals.enrollmentCollection.updateOne(
        { _id: enrollment._id },
        { $set: { certificate_id: saved.certificate_id } },
      );
      await audit(
        req,
        access.user,
        "certificate.issued",
        access.institutionId,
        { certificateId: saved.certificate_id },
      );
      res.status(201).json({ certificate: serialize(saved) });
    }),
  );
  router.get(
    "/institutions/:institutionId",
    wrap(async (req, res) => {
      const locals = req.app.locals,
        institutionId = req.params.institutionId;
      const institution = await locals.institutionCollection.findOne({
        _id: id(institutionId),
        status: "active",
      });
      if (!institution) {
        res.status(404).json({ message: "Institution not found." });
        return;
      }
      const [programs, courses, announcements] = await Promise.all([
        locals.institutionProgramCollection
          .find({ institutionId, status: "approved" })
          .toArray(),
        locals.courseCollection
          .find({ institutionId, status: "published" })
          .project({
            title: 1,
            slug: 1,
            thumbnail_url: 1,
            course_type: 1,
            price_pi: 1,
            piPaymentsEnabled: 1,
          })
          .toArray(),
        locals.institutionAnnouncementCollection
          .find({ institutionId })
          .sort({ createdAt: -1 })
          .limit(30)
          .toArray(),
      ]);
      res.json({
        institution: publicInstitution(institution),
        programs: programs.map((p: any) => {
          const { learningInstructions, learningUrl, ...publicFields } = p;
          return serialize(publicFields);
        }),
        courses: courses.map(serialize),
        announcements: announcements.map(serialize),
      });
    }),
  );
  router.post(
    "/institutions/:institutionId/apply",
    wrap(async (req, res) => {
      const user = await userFor(req, res);
      if (!user) return;
      const institutionId = req.params.institutionId,
        institution = await req.app.locals.institutionCollection.findOne({
          _id: id(institutionId),
        });
      if (
        !isInstitutionPartner(institution) ||
        !institution.capabilities.apply
      ) {
        res
          .status(403)
          .json({
            message: "SMAJ applications are not enabled for this institution.",
          });
        return;
      }
      const programId = text(req.body.programId, 100);
      if (
        programId &&
        !(await req.app.locals.institutionProgramCollection.findOne({
          _id: id(programId),
          institutionId,
          status: "approved",
        }))
      )
        throw new Error("Select an approved program from this institution.");
      const statement = text(req.body.statement, 5000);
      if (statement.length < 10)
        throw new Error("Provide an application statement.");
      const row = {
        institutionId,
        programId,
        userId: String(user._id),
        applicantName: user.displayName || user.username,
        statement,
        status: "submitted",
        createdAt: now(),
        updatedAt: now(),
      };
      const result =
        await req.app.locals.institutionStudentApplicationCollection.insertOne(
          row,
        );
      res
        .status(201)
        .json({ application: serialize({ ...row, _id: result.insertedId }) });
    }),
  );
  router.post(
    "/institutions/:institutionId/programs/:programId/enroll",
    wrap(async (req, res) => {
      const user = await userFor(req, res);
      if (!user) return;
      const { institutionId, programId } = req.params,
        locals = req.app.locals;
      const institution = await locals.institutionCollection.findOne({
        _id: id(institutionId),
      });
      const program = await locals.institutionProgramCollection.findOne({
        _id: id(programId),
        institutionId,
        status: "approved",
        enrollmentEnabled: true,
      });
      if (
        !isInstitutionPartner(institution) ||
        !institution.capabilities.enroll ||
        !program
      ) {
        res
          .status(403)
          .json({ message: "Program enrollment is not available." });
        return;
      }
      if (
        program.pricePi > 0 &&
        (!env.pi_payments_enabled ||
          !institution.piPaymentsEnabled ||
          !program.piPaymentsEnabled)
      )
        throw new Error(
          "Paid enrollment requires explicitly approved Pi payments in this deployment.",
        );
      const key = { institutionId, programId, user_id: String(user._id) };
      const seed = {
        enrollment_id: new ObjectId().toString(),
        institutionId,
        programId,
        user_id: String(user._id),
        course_id: "",
        course_slug: "",
        course_title: program.name,
        enrollment_type: program.pricePi > 0 ? "paid" : "free",
        status: program.pricePi > 0 ? "pending_payment" : "active",
        progress_percentage: 0,
        completed_lesson_ids: [],
        created_at: now(),
        updated_at: now(),
        priceSnapshotPi: program.pricePi,
        priceSnapshotUsdt: program.priceUsdt,
        payment_id: program.pricePi > 0 ? new ObjectId().toString() : undefined,
      };
      try {
        await locals.enrollmentCollection.updateOne(
          key,
          { $setOnInsert: seed },
          { upsert: true },
        );
      } catch (error: any) {
        if (error.code !== 11000) throw error;
      }
      const enrollment = await locals.enrollmentCollection.findOne(key);
      let payment: any = null;
      if (enrollment.payment_id) {
        const paymentKey = {
          payment_id: enrollment.payment_id,
          user_id: enrollment.user_id,
        };
        try {
          await locals.coursePaymentCollection.updateOne(
            paymentKey,
            {
              $setOnInsert: {
                _id: enrollment._id,
                ...paymentKey,
                institutionId,
                programId,
                course_id: "",
                course_slug: "",
                course_title: enrollment.course_title,
                instructor_id: "",
                provider_id: institutionId,
                amount_pi: enrollment.priceSnapshotPi,
                amount_usdt: enrollment.priceSnapshotUsdt,
                status: "pending",
                audit_metadata: { initiated_by: String(user._id) },
                created_at: now(),
                updated_at: now(),
              },
            },
            { upsert: true },
          );
        } catch (error: any) {
          if (error.code !== 11000) throw error;
        }
        payment = await locals.coursePaymentCollection.findOne(paymentKey);
      }
      await grantInstitutionProgramCourses(req, enrollment);
      res.json({
        enrollment: serialize(enrollment),
        payment: serialize(payment),
      });
    }),
  );
  router.get(
    "/institution-learning",
    wrap(async (req, res) => {
      const user = await userFor(req, res);
      if (!user) return;
      const locals = req.app.locals;
      const enrollments = await locals.enrollmentCollection
        .find({ user_id: String(user._id), institutionId: { $exists: true } })
        .toArray();
      const rows = await Promise.all(
        enrollments.map(async (enrollment: any) => {
          const program = enrollment.programId
            ? await locals.institutionProgramCollection.findOne({
                _id: id(enrollment.programId),
                institutionId: enrollment.institutionId,
              })
            : null;
          const institution = await locals.institutionCollection.findOne({
            _id: id(enrollment.institutionId),
          });
          const accessEnabled =
            isInstitutionPartner(institution) &&
            program?.status === "approved" &&
            ["active", "completed"].includes(enrollment.status);
          return {
            ...serialize(enrollment),
            learningInstructions: accessEnabled
              ? program?.learningInstructions || ""
              : "",
            learningUrl: accessEnabled ? program?.learningUrl || "" : "",
          };
        }),
      );
      res.json({
        enrollments: rows,
        applications: (
          await locals.institutionStudentApplicationCollection
            .find({ userId: String(user._id) })
            .toArray()
        ).map(serialize),
      });
    }),
  );
  router.get(
    "/admin/institutions",
    wrap(async (req, res) => {
      const user = await userFor(req, res, true);
      if (!user) return;
      res.json({
        institutions: (
          await req.app.locals.institutionCollection
            .find({})
            .sort({ name: 1 })
            .toArray()
        ).map(publicInstitution),
        applications: (
          await req.app.locals.institutionApplicationCollection
            .find({})
            .sort({ updatedAt: -1 })
            .toArray()
        ).map(serialize),
      });
    }),
  );
  router.post(
    "/admin/institutions",
    wrap(async (req, res) => {
      const user = await userFor(req, res, true);
      if (!user) return;
      const profile = institutionProfile(req.body);
      const row = {
        ...profile,
        slug:
          profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
          "-" +
          new ObjectId().toString().slice(-6),
        partnerStatus: "directory",
        verificationStatus: "unverified",
        status: "active",
        piPaymentsEnabled: false,
        capabilities: { apply: false, enroll: false, certificates: false },
        createdAt: now(),
        updatedAt: now(),
      };
      const result = await req.app.locals.institutionCollection.insertOne(row);
      await audit(req, user, "institution.created", String(result.insertedId));
      res
        .status(201)
        .json({
          institution: publicInstitution({
            ...row,
            _id: result.insertedId,
          } as any),
        });
    }),
  );
  router.patch(
    "/admin/institutions/:institutionId",
    wrap(async (req, res) => {
      const user = await userFor(req, res, true);
      if (!user) return;
      const institutionId = req.params.institutionId,
        collection = req.app.locals.institutionCollection;
      const existing = await collection.findOne({ _id: id(institutionId) });
      if (!existing) {
        res.status(404).json({ message: "Institution not found." });
        return;
      }
      const b = req.body,
        updates: any = {
          ...institutionProfile({ ...existing, ...b }),
          updatedAt: now(),
        };
      if (b.partnerStatus !== undefined) {
        if (!["directory", "smaj_verified_partner"].includes(b.partnerStatus))
          throw new Error("Invalid partnership status.");
        updates.partnerStatus = b.partnerStatus;
        updates.verificationStatus =
          b.partnerStatus === "smaj_verified_partner"
            ? "verified"
            : "unverified";
      }
      if (b.status !== undefined) {
        if (!["active", "suspended"].includes(b.status))
          throw new Error("Invalid institution status.");
        updates.status = b.status;
      }
      if (b.piPaymentsEnabled !== undefined)
        updates.piPaymentsEnabled = b.piPaymentsEnabled === true;
      if (b.capabilities)
        updates.capabilities = {
          apply: b.capabilities.apply === true,
          enroll: b.capabilities.enroll === true,
          certificates: b.capabilities.certificates === true,
        };
      if (!isInstitutionPartner({ ...existing, ...updates })) {
        updates.piPaymentsEnabled = false;
        updates.capabilities = {
          apply: false,
          enroll: false,
          certificates: false,
        };
      }
      await collection.updateOne({ _id: existing._id }, { $set: updates });
      await audit(
        req,
        user,
        "institution.configuration_changed",
        institutionId,
        {
          partnerStatus: updates.partnerStatus,
          status: updates.status,
          capabilities: updates.capabilities,
          piPaymentsEnabled: updates.piPaymentsEnabled,
        },
      );
      res.json({ institution: publicInstitution({ ...existing, ...updates }) });
    }),
  );
  router.patch(
    "/admin/institution-applications/:applicationId",
    wrap(async (req, res) => {
      const user = await userFor(req, res, true);
      if (!user) return;
      const collection = req.app.locals.institutionApplicationCollection,
        application = await collection.findOne({
          _id: id(req.params.applicationId),
        });
      if (
        !application ||
        ["draft", "approved", "rejected"].includes(application.status)
      )
        throw new Error("Only submitted applications can be reviewed.");
      const status = req.body.status;
      if (
        !["under_review", "needs_information", "approved", "rejected"].includes(
          status,
        )
      )
        throw new Error("Invalid review decision.");
      const reviewNotes = text(req.body.reviewNotes, 3000);
      if (["needs_information", "rejected"].includes(status) && !reviewNotes)
        throw new Error("Provide a reason or the information requested.");
      if (status === "approved") {
        institutionProfile(application.profile);
        if (!application.evidenceUrl)
          throw new Error("Authorization evidence is required for approval.");
      }
      const reviewLock = new ObjectId().toString();
      const claimed = await collection.updateOne(
        {
          _id: application._id,
          status: application.status,
          $or: [
            { reviewLock: { $exists: false } },
            { reviewLockUntil: { $lte: Date.now() } },
          ],
        },
        { $set: { reviewLock, reviewLockUntil: Date.now() + 60000 } },
      );
      if (!claimed.matchedCount) {
        res
          .status(409)
          .json({
            message:
              "This application changed or is being reviewed. Reload first.",
          });
        return;
      }
      let institutionId = application.institutionId || "";
      try {
        if (status === "approved") {
          institutionId = String(application._id);
          const profile = institutionProfile(application.profile);
          const row = {
            ...profile,
            slug:
              profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
              "-" +
              institutionId.slice(-6),
            partnershipApplicationId: String(application._id),
            partnerStatus: "smaj_verified_partner",
            verificationStatus: "verified",
            status: "active",
            piPaymentsEnabled: false,
            capabilities: { apply: false, enroll: false, certificates: false },
            createdAt: now(),
            updatedAt: now(),
          };
          await req.app.locals.institutionCollection.updateOne(
            { _id: application._id },
            { $setOnInsert: row },
            { upsert: true },
          );
          await req.app.locals.institutionAdminCollection.updateOne(
            { institutionId, userId: application.applicantId },
            { $setOnInsert: { status: "active", createdAt: now() } },
            { upsert: true },
          );
        }
        const changed = await collection.updateOne(
          { _id: application._id, reviewLock },
          {
            $set: {
              status,
              institutionId,
              reviewNotes,
              reviewedBy: String(user._id),
              updatedAt: now(),
            },
            $unset: { reviewLock: "", reviewLockUntil: "" },
          },
        );
        if (!changed.matchedCount)
          throw new Error("Review changed. Reload the application.");
        await audit(
          req,
          user,
          "partnership_application." + status,
          institutionId,
          { applicationId: String(application._id), reviewNotes },
        );
        res.json({ status, institutionId });
      } catch (error) {
        await collection.updateOne(
          { _id: application._id, reviewLock },
          { $unset: { reviewLock: "", reviewLockUntil: "" } },
        );
        throw error;
      }
    }),
  );
  router.post(
    "/admin/institutions/:institutionId/administrators",
    wrap(async (req, res) => {
      const user = await userFor(req, res, true);
      if (!user) return;
      const institutionId = req.params.institutionId,
        userId = text(req.body.userId, 100);
      if (
        !(await req.app.locals.institutionCollection.findOne({
          _id: id(institutionId),
        })) ||
        !(await req.app.locals.userCollection.findOne({ _id: id(userId) }))
      )
        throw new Error("Institution or user not found.");
      const status = req.body.status === "revoked" ? "revoked" : "active";
      await req.app.locals.institutionAdminCollection.updateOne(
        { institutionId, userId },
        {
          $set: { status, updatedAt: now() },
          $setOnInsert: { createdAt: now() },
        },
        { upsert: true },
      );
      await audit(
        req,
        user,
        "institution.administrator_" + status,
        institutionId,
        { userId },
      );
      res.json({ updated: true });
    }),
  );
  router.patch(
    "/admin/institution-certificates/:certificateId",
    wrap(async (req, res) => {
      const user = await userFor(req, res, true);
      if (!user) return;
      const row = await req.app.locals.certificateCollection.findOne({
        _id: id(req.params.certificateId),
        institutionId: { $exists: true },
      });
      if (!row) throw new Error("Institution certificate not found.");
      if (!["valid", "revoked"].includes(req.body.status))
        throw new Error("Invalid certificate status.");
      await req.app.locals.certificateCollection.updateOne(
        { _id: row._id },
        {
          $set: {
            status: req.body.status,
            revocation_reason: text(req.body.reason, 1000),
            updated_at: now(),
          },
        },
      );
      await audit(req, user, "certificate.status_changed", row.institutionId, {
        certificateId: row.certificate_id,
        status: req.body.status,
      });
      res.json({ updated: true });
    }),
  );
}
