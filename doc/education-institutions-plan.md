# Education institutions: implementation and review

Institutions is a separate education provider directory. Universities retain their existing implementation. One institution model covers academies, online schools, primary and secondary schools, training/professional institutes, language schools, religious education, technical/vocational providers, coding bootcamps, learning centers, and other providers.

## Routes

| Frontend route | Purpose |
| --- | --- |
| `/education/institutions` | Public searchable directory |
| `/services/education/institutions` | Directory alias |
| `/education/institutions/:institutionId` | Public profile and published offerings |
| `/education/institutions/apply` | Authenticated partnership application and review status |
| `/education/institution-portal` | Authenticated partner workspace |
| `/education/institution-learning` | Student applications, enrollments, learning links and certificates |
| `/admin/education/institutions` | SMAJ administrator review and configuration |

The API uses `/education` endpoints, separating public profiles from authenticated applications, learning, scoped portal actions, and administrator endpoints. Backend authorization governs access.

## Schema and indexes

New collections: `institutions`, `institution_admins`, `institution_applications`, `institution_programs`, `institution_student_applications`, `institution_announcements`, `institution_audit`, and `institution_evidence`.

Profiles include provider identity, type, delivery mode, contact/media URLs, location, languages, subjects, categories, admission information, partnership/verification status, active/suspended status, Pi configuration, and apply/enroll/certificate capabilities.

Partnership applications support draft, submitted, under_review, needs_information, approved, and rejected. They store applicant identity/role, profile, authorization evidence, offerings, Pi interest, and review notes. Authenticated evidence uploads record ownership.

Programs contain institution ownership, included course IDs, draft/approved/archived status, enrollment/payment/certificate flags, prices, and learning instructions/URL. Courses retain the existing model with institution provider fields. Enrollments, course payments, and certificates reuse existing collections.

Startup adds unique institution slugs and administrator memberships, institution course/program enrollment uniqueness, certificate enrollment uniqueness, and indexes for directory filtering, applications, programs, evidence and audits. Validate index creation and existing conflicting records against the intended database before rollout.

## Permissions and lifecycle

- Non-partner directory listings provide public information with partner capabilities disabled.
- SMAJ administrators approve partnerships, configure capabilities and payments, assign managers, suspend providers, approve offerings, and manage certificate status.
- Approval uses deterministic IDs, upserts, and a bounded review lock. New partners have payments and apply/enroll/certificate capabilities disabled until separately enabled.
- Institution managers act only within their institution. Profile edits cannot change verification or Pi configuration. Edited published courses require renewed review.
- Student actions require enabled capabilities and approved offerings. Paid enrollment remains pending until confirmed Pi completion. Server checks bind payer UID, metadata, amount, and verified transaction. Repeat requests preserve existing enrollment and completion state.
- Confirmed program enrollment grants included published courses belonging to that institution. Learning links require eligible enrollment and active partner status.
- Certificate issuance requires authorized management, confirmed completion, and enabled institution/program certificate capability. It is idempotent and reuses existing certificate verification.
- Suspension preserves history while disabling the institution actions and learning access covered by the guards.

## Configuration

Reuse existing database, authentication, upload, and Pi configuration. Backend `PI_PAYMENTS_ENABLED` and `PI_API_KEY`, institution payment permission, and offering payment permission govern paid offerings. Frontend payment availability also depends on the deployment.

Uploads reuse `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`, and `CLOUDINARY_FOLDER`. Authorization evidence accepts PDF, JPG, PNG, or WebP up to 5 MB. Submission requires evidence uploaded by the applicant. External URLs require HTTPS.

## Validation and rollout

Run `npm run build` in backend and frontend and `npm run test:institutions` in backend. The 15 regression tests cover directory restrictions, ordinary-user authorization, institution isolation, protected configuration, evidence ownership, concurrent approval, offering approval, paid enrollment idempotency, disabled payments, Pi binding/completion, certificates, suspension, combined filters, and private course access.

Review the uncommitted diff and validate database indexes before deployment. Browser smoke checks should cover filters, evidence uploads, administrator review, partner management, free enrollment, Pi sandbox enrollment, and certificate verification. Local fixtures and mocked Pi calls do not establish live MongoDB, Cloudinary, or Pi behavior.

No commit, push, or deployment is authorized by this task.
