import type { Request } from "express";
import env from "../environments";
import { ObjectId } from "mongodb";
import { institutionTypes, type InstitutionData } from "../types/institutions";
export const text = (value: unknown, limit = 1000) =>
  String(value ?? "")
    .trim()
    .slice(0, limit);
export const list = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((v) => text(v, 100))
    .filter(Boolean)
    .slice(0, 30);
export const secureUrl = (value: unknown) => {
  const url = text(value, 1200);
  if (!url) return "";
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("Use an HTTPS URL without credentials.");
  return url;
};
export const isInstitutionPartner = (institution: any) =>
  institution?.status === "active" &&
  institution?.partnerStatus === "smaj_verified_partner" &&
  institution?.verificationStatus === "verified";
export function institutionProfile(body: any, draft = false) {
  if (
    !Object.prototype.hasOwnProperty.call(
      institutionTypes,
      body.institutionType,
    )
  )
    throw new Error("Choose a supported institution type.");
  if (!["online", "physical", "hybrid"].includes(body.deliveryMode))
    throw new Error("Choose Online, Physical, or Hybrid.");
  const name = text(body.name, 160),
    country = text(body.country, 80),
    description = text(body.description, 5000);
  if (!draft && (name.length < 2 || !country || description.length < 10))
    throw new Error("Institution name, country, and description are required.");
  const email = text(body.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid official email.");
  return {
    name,
    institutionType: body.institutionType,
    country,
    description,
    deliveryMode: body.deliveryMode,
    logo: secureUrl(body.logo),
    coverImage: secureUrl(body.coverImage),
    website: secureUrl(body.website),
    email,
    phone: text(body.phone, 80),
    city: text(body.city, 120),
    location: text(body.location, 300),
    socialLinks: (Array.isArray(body.socialLinks) ? body.socialLinks : [])
      .slice(0, 10)
      .map(secureUrl),
    languages: list(body.languages),
    subjects: list(body.subjects),
    categories: list(body.categories),
    admissionInformation: text(body.admissionInformation, 3000),
  };
}
export async function canManageInstitution(
  req: Request,
  user: any,
  institutionId: string,
) {
  if (user.role === "admin") return true;
  if (
    !ObjectId.isValid(institutionId) ||
    !isInstitutionPartner(
      await req.app.locals.institutionCollection.findOne({
        _id: new ObjectId(institutionId),
      }),
    )
  )
    return false;
  return Boolean(
    await req.app.locals.institutionAdminCollection.findOne({
      institutionId,
      userId: user._id.toString(),
      status: "active",
    }),
  );
}
export async function assertInstitutionCourse(
  req: Request,
  course: any,
  capability: "enroll" | "payment" | "certificates",
) {
  if (!course?.institutionId) return;
  if (!ObjectId.isValid(course.institutionId))
    throw new Error("Invalid institution provider.");
  const institution = await req.app.locals.institutionCollection.findOne({
    _id: new ObjectId(course.institutionId),
  });
  if (!isInstitutionPartner(institution))
    throw new Error("This institution is not an active SMAJ verified partner.");
  if (
    capability === "payment"
      ? !institution.piPaymentsEnabled || !course.piPaymentsEnabled
      : !institution.capabilities?.[capability]
  )
    throw new Error("This institution capability is not enabled.");
  if (capability === "payment" && !env.pi_payments_enabled)
    throw new Error("Pi payments are disabled for this deployment.");
  if (course.status !== "published")
    throw new Error("The institution course is not approved.");
}
export async function assertInstitutionPayment(req: Request, payment: any) {
  if (!payment?.institutionId) return;
  const institution = await req.app.locals.institutionCollection.findOne({
    _id: new ObjectId(payment.institutionId),
  });
  if (
    !env.pi_payments_enabled ||
    !isInstitutionPartner(institution) ||
    !institution.piPaymentsEnabled ||
    !institution.capabilities?.enroll
  )
    throw new Error("Institution Pi payment is not enabled.");
  if (payment.programId) {
    const program = await req.app.locals.institutionProgramCollection.findOne({
      _id: new ObjectId(payment.programId),
      institutionId: payment.institutionId,
    });
    if (
      !program ||
      program.status !== "approved" ||
      !program.piPaymentsEnabled ||
      !program.enrollmentEnabled
    )
      throw new Error("Program payment is not approved.");
  } else if (payment.course_id) {
    const course = await req.app.locals.courseCollection.findOne({
      _id: new ObjectId(payment.course_id),
    });
    if (!course || course.institutionId !== payment.institutionId)
      throw new Error("Institution payment offering not found.");
    await assertInstitutionCourse(req, course, "payment");
  } else throw new Error("Institution payment offering not found.");
}
export function assertPiPaymentBinding(
  remote: any,
  payment: any,
  piUser: any,
  txid?: string,
) {
  if (
    !piUser?.uid ||
    remote.user_uid !== piUser.uid ||
    String(remote.metadata?.coursePaymentId || "") !== String(payment._id) ||
    Number(remote.amount) !== Number(payment.amount_pi) ||
    remote.status?.cancelled ||
    remote.status?.user_cancelled ||
    (txid &&
      (remote.transaction?.txid !== txid ||
        remote.transaction?.verified !== true))
  )
    throw new Error(
      "Pi payment does not match this enrollment and transaction.",
    );
}
export const publicInstitution = (record: InstitutionData) => ({
  ...record,
  id: record._id.toString(),
  _id: undefined,
  partnerBadge: isInstitutionPartner(record)
    ? "SMAJ VERIFIED PARTNER"
    : "NOT YET A SMAJ PARTNER",
  piPaymentsEnabled: isInstitutionPartner(record) && record.piPaymentsEnabled,
  capabilities: isInstitutionPartner(record)
    ? record.capabilities
    : { apply: false, enroll: false, certificates: false },
});

export async function grantInstitutionProgramCourses(
  req: Request,
  enrollment: any,
) {
  if (
    !enrollment?.programId ||
    !["active", "completed"].includes(enrollment.status)
  )
    return;
  const locals = req.app.locals,
    program = await locals.institutionProgramCollection.findOne({
      _id: new ObjectId(enrollment.programId),
      institutionId: enrollment.institutionId,
      status: "approved",
    });
  if (!program) return;
  for (const courseId of program.courseIds || []) {
    const course = await locals.courseCollection.findOne({
      _id: new ObjectId(courseId),
      institutionId: enrollment.institutionId,
      status: "published",
    });
    if (!course) continue;
    const key = {
      user_id: enrollment.user_id,
      course_id: courseId,
      institutionId: enrollment.institutionId,
    };
    try {
      await locals.enrollmentCollection.updateOne(
        key,
        {
          $setOnInsert: {
            ...key,
            enrollment_id: new ObjectId().toString(),
            course_slug: course.slug,
            course_title: course.title,
            sourceProgramId: enrollment.programId,
            enrollment_type: enrollment.enrollment_type,
            status: "active",
            progress_percentage: 0,
            completed_lesson_ids: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        { upsert: true },
      );
    } catch (error: any) {
      if (error.code !== 11000) throw error;
    }
  }
}
