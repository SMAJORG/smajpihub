import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import AppLayout from "../../layouts/AppLayout";
import EducationHeader from "./EducationHeader";
import EducationBackBar from "../../components/education/EducationBackBar";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import { uploadImage } from "../../lib/uploadImage";
import { institutionApi } from "../../lib/institutionsApi";
import { approveCoursePayment, completeCoursePayment } from "../../lib/coursesApi";
import { isPiPaymentAvailable } from "../../lib/soloHost";
import {
  institutionTypes,
  type Institution,
  type InstitutionProgram,
  type InstitutionApplication,
  type InstitutionProfileResponse,
  type InstitutionPortalResponse,
  type InstitutionRecord,
} from "../../types/institutions";
import "./Institutions.css";
const errorText = (error: unknown) =>
  isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || error.message
    : error instanceof Error
      ? error.message
      : "Request failed. Try again.";
const emptyProfile: Partial<Institution> = {
  name: "",
  institutionType: "online_academy",
  deliveryMode: "online",
  country: "",
  description: "",
  languages: [],
  subjects: [],
  categories: [],
  socialLinks: [],
};
const commaList = (value: string) =>
  value
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
function EducationShell({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <AppLayout showHeader={false} showFooter={false}>
      <main className="education-page institution-page">
        <EducationHeader query={query} onQueryChange={setQuery} />
        <EducationBackBar current="Institutions" />
        <section className="institution-content">{children}</section>
      </main>
    </AppLayout>
  );
}
function Badge({ institution }: { institution: Institution }) {
  return (
    <span
      className={
        institution.partnerStatus === "smaj_verified_partner" && institution.status === "active"
          ? "institution-badge partner"
          : "institution-badge"
      }
    >
      {institution.partnerBadge}
    </span>
  );
}
function ListField({ value, label, change }: { value: string[]; label: string; change: (items: string[]) => void }) {
  const [raw, setRaw] = useState(value.join(", "));
  useEffect(() => {
    setRaw(value.join(", "));
  }, [value]);
  return (
    <label>
      {label}
      <input value={raw} onChange={e => setRaw(e.target.value)} onBlur={() => change(commaList(raw))} />
    </label>
  );
}
function ProfileFields({
  value,
  change,
}: {
  value: Partial<Institution>;
  change: (next: Partial<Institution>) => void;
}) {
  const [uploadError, setUploadError] = useState("");
  const set = (key: keyof Institution, item: unknown) => change({ ...value, [key]: item });
  const upload = async (file?: File, key: "logo" | "coverImage" = "logo") => {
    if (!file) return;
    setUploadError("");
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024)
        throw new Error("Choose a JPG, PNG, or WebP image up to 5 MB.");
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      set(key, await uploadImage(image, "institution-" + key));
    } catch (error) {
      setUploadError(errorText(error));
    }
  };
  return (
    <div className="institution-form-grid">
      <label>
        Official institution name
        <input required value={value.name || ""} maxLength={160} onChange={e => set("name", e.target.value)} />
      </label>
      <label>
        Institution type
        <select value={value.institutionType} onChange={e => set("institutionType", e.target.value)}>
          {Object.entries(institutionTypes).map(([type, label]) => (
            <option value={type} key={type}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Country
        <input required value={value.country || ""} onChange={e => set("country", e.target.value)} />
      </label>
      <label>
        City
        <input value={value.city || ""} onChange={e => set("city", e.target.value)} />
      </label>
      <label>
        Location/address
        <input value={value.location || ""} onChange={e => set("location", e.target.value)} />
      </label>
      <label>
        Delivery mode
        <select value={value.deliveryMode} onChange={e => set("deliveryMode", e.target.value)}>
          <option value="online">Online</option>
          <option value="physical">Physical</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </label>
      <label className="wide">
        About the institution
        <textarea
          required
          minLength={10}
          value={value.description || ""}
          onChange={e => set("description", e.target.value)}
        />
      </label>
      {(["logo", "coverImage"] as const).map(key => (
        <label key={key}>
          {key === "logo" ? "Logo" : "Cover image"}
          <input type="url" placeholder="https://" value={value[key] || ""} onChange={e => set(key, e.target.value)} />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={e => void upload(e.target.files?.[0], key)}
          />
          {value[key] ? <img className="institution-upload-preview" src={value[key]} alt={key} /> : null}
        </label>
      ))}
      <label>
        Official email
        <input type="email" value={value.email || ""} onChange={e => set("email", e.target.value)} />
      </label>
      <label>
        Phone
        <input type="tel" value={value.phone || ""} onChange={e => set("phone", e.target.value)} />
      </label>
      <label>
        Official website
        <input
          type="url"
          placeholder="https://"
          value={value.website || ""}
          onChange={e => set("website", e.target.value)}
        />
      </label>
      {(["languages", "subjects", "categories", "socialLinks"] as const).map(key => (
        <ListField
          key={key}
          value={value[key] || []}
          label={key === "socialLinks" ? "Social links (HTTPS, comma separated)" : key + " (comma separated)"}
          change={items => set(key, items)}
        />
      ))}
      <label className="wide">
        Admission/enrollment information
        <textarea
          value={value.admissionInformation || ""}
          onChange={e => set("admissionInformation", e.target.value)}
        />
      </label>
      {uploadError ? (
        <p className="institution-error wide" role="alert">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}
export function InstitutionsPage() {
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<{
    institutions: Institution[];
    total: number;
    page: number;
    totalPages: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const query = params.toString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void institutionApi
      .directory(new URLSearchParams(query))
      .then(data => {
        if (active) setResult(data);
      })
      .catch(e => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query]);
  const filter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = new FormData(e.currentTarget),
      next = new URLSearchParams();
    values.forEach((value, key) => {
      if (String(value).trim()) next.set(key, String(value).trim());
    });
    setParams(next);
  };
  return (
    <EducationShell>
      <p className="private-kicker">EDUCATION PROVIDERS</p>
      <h1>Institutions</h1>
      <p>Discover schools, academies, training institutes and other education providers.</p>
      <div className="institution-actions">
        <Link to="/education/institutions/apply">Apply to join SMAJ</Link>
        <Link to="/education/institution-portal">Institution Portal</Link>
        <Link to="/education/institution-learning">My institution learning</Link>
      </div>
      <form className="institution-filter" onSubmit={filter} key={query}>
        <label>
          Search
          <input name="q" defaultValue={params.get("q") || ""} placeholder="Institution or subject" />
        </label>
        <label>
          Institution type
          <select name="institutionType" defaultValue={params.get("institutionType") || ""}>
            <option value="">All types</option>
            {Object.entries(institutionTypes).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Country
          <input name="country" defaultValue={params.get("country") || ""} />
        </label>
        <label>
          Delivery
          <select name="deliveryMode" defaultValue={params.get("deliveryMode") || ""}>
            <option value="">All delivery modes</option>
            <option value="online">Online</option>
            <option value="physical">Physical</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>
        <label>
          Language
          <input name="languages" defaultValue={params.get("languages") || ""} />
        </label>
        <label>
          Subject
          <input name="subjects" defaultValue={params.get("subjects") || ""} />
        </label>
        <label>
          Category
          <input name="categories" defaultValue={params.get("categories") || ""} />
        </label>
        <label>
          Partnership
          <select name="partnerStatus" defaultValue={params.get("partnerStatus") || ""}>
            <option value="">All institutions</option>
            <option value="smaj_verified_partner">SMAJ VERIFIED PARTNER</option>
            <option value="directory">NOT YET A SMAJ PARTNER</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
        <button type="button" onClick={() => setParams({})}>
          Clear
        </button>
      </form>
      <p>
        Directory inclusion does not imply a SMAJ partnership. Non-partner listings provide public information only.
      </p>
      {error ? (
        <p role="alert" className="institution-error">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Loading institutions...</p>
      ) : (
        <>
          <p>{result?.total || 0} institutions</p>
          <div className="institution-grid">
            {result?.institutions.map(item => (
              <article className="institution-card" key={item.id}>
                {item.logo ? <img className="institution-logo" src={item.logo} alt="" /> : <SchoolOutlinedIcon />}
                <h2>{item.name}</h2>
                <p>
                  {institutionTypes[item.institutionType]} / {item.deliveryMode} / {item.country}
                </p>
                <p>{item.subjects.join("  /  ")}</p>
                <Badge institution={item} />
                <Link to={"/education/institutions/" + item.id}>View Institution</Link>
              </article>
            ))}
          </div>
          {!result?.institutions.length ? (
            <p>No institutions match these filters. Try another search or apply to join SMAJ.</p>
          ) : null}
          <div className="institution-actions">
            <button
              disabled={!result || result.page <= 1}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("page", String((result?.page || 1) - 1));
                setParams(next);
              }}
            >
              Previous
            </button>
            <span>
              {result?.page || 1} / {result?.totalPages || 1}
            </span>
            <button
              disabled={!result || result.page >= result.totalPages}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("page", String((result?.page || 1) + 1));
                setParams(next);
              }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </EducationShell>
  );
}
export function InstitutionProfilePage() {
  const { institutionId = "" } = useParams();
  const { user } = useAuthContext();
  const [data, setData] = useState<InstitutionProfileResponse | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [programId, setProgramId] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<{ id: string; amount_pi: number } | null>(null);
  useEffect(() => {
    let active = true;
    void institutionApi
      .profile(institutionId)
      .then(result => {
        if (active) setData(result);
      })
      .catch(e => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [institutionId]);
  const enroll = async (program: InstitutionProgram) => {
    setBusy(true);
    setError("");
    try {
      const result = await institutionApi.post(
        "institutions/" + institutionId + "/programs/" + program.id + "/enroll",
        {}
      );
      setPayment(["pending", "processing"].includes(result.payment?.status) ? result.payment : null);
      setMessage(
        ["pending", "processing"].includes(result.payment?.status)
          ? "Enrollment created. Complete payment in Pi Browser."
          : "Enrollment confirmed. Open My institution learning for access instructions."
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const pay = async () => {
    if (!payment || !isPiPaymentAvailable() || busy) return;
    setBusy(true);
    setError("");
    try {
      let recovery: Promise<unknown> | undefined;
      await window.Pi!.authenticate(["payments"], incomplete => {
        if (String(incomplete.metadata?.coursePaymentId || "") === payment.id && incomplete.transaction?.txid) {
          recovery = completeCoursePayment(payment.id, incomplete.transaction.txid);
        }
      });
      if (recovery) {
        await recovery;
        setPayment(null);
        setMessage("Payment confirmed. Open My institution learning.");
        setBusy(false);
        return;
      }
      await window.Pi!.createPayment(
        {
          amount: payment.amount_pi,
          memo: "Institution enrollment",
          metadata: { coursePaymentId: payment.id, institutionId },
        },
        {
          onReadyForServerApproval: async paymentId => {
            try {
              await approveCoursePayment(payment.id, paymentId);
            } catch (e) {
              setError(errorText(e));
              setBusy(false);
            }
          },
          onReadyForServerCompletion: async (_, txid) => {
            try {
              await completeCoursePayment(payment.id, txid);
              setPayment(null);
              setMessage("Payment confirmed. View My institution learning for your access instructions.");
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          },
          onCancel: () => {
            setMessage("Payment cancelled. You can continue later.");
            setBusy(false);
          },
          onError: e => {
            setError(errorText(e));
            setBusy(false);
          },
        }
      );
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const apply = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await institutionApi.post("institutions/" + institutionId + "/apply", { statement, programId });
      setMessage("Application submitted. Track it in My institution learning.");
      setStatement("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <EducationShell>
        <p role="status">{error || "Loading institution..."}</p>
      </EducationShell>
    );
  const { institution: item } = data,
    partner = item.partnerStatus === "smaj_verified_partner" && item.status === "active";
  return (
    <EducationShell>
      {item.coverImage ? <img className="institution-cover" src={item.coverImage} alt="" /> : null}
      <div className="institution-title">
        {item.logo ? <img src={item.logo} alt="" /> : <SchoolOutlinedIcon />}
        <div>
          <h1>{item.name}</h1>
          <p>{institutionTypes[item.institutionType]}</p>
          <Badge institution={item} />
        </div>
      </div>
      <p>{item.description}</p>
      <dl>
        <dt>Location</dt>
        <dd>{[item.country, item.city, item.location].filter(Boolean).join("  /  ")}</dd>
        <dt>Delivery</dt>
        <dd>{item.deliveryMode}</dd>
        <dt>Languages</dt>
        <dd>{item.languages.join(", ")}</dd>
        <dt>Subjects</dt>
        <dd>{item.subjects.join(", ")}</dd>
      </dl>
      <h2>Admission and enrollment information</h2>
      <p>{item.admissionInformation || "Contact the institution for admission details."}</p>
      <div className="institution-actions">
        {item.website ? (
          <a href={item.website} target="_blank" rel="noreferrer">
            Official website
          </a>
        ) : null}
        {item.email ? <a href={"mailto:" + item.email}>Contact Institution</a> : null}
        {item.phone ? <a href={"tel:" + item.phone}>{item.phone}</a> : null}
        {item.socialLinks.map((url, index) => (
          <a href={url} target="_blank" rel="noreferrer" key={url}>
            Social link {index + 1}
          </a>
        ))}
      </div>
      {!partner ? (
        <p>
          This is an informational directory listing. SMAJ enrollment, Pi payment, and verified certificate services are
          not enabled.
        </p>
      ) : null}
      {error ? (
        <p className="institution-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <h2 id="programs">Programs</h2>
      <div className="institution-grid">
        {data.programs.map(program => (
          <article className="institution-card" key={program.id}>
            <h3>{program.name}</h3>
            <p>{program.description}</p>
            <p>
              {partner
                ? program.pricePi > 0
                  ? program.pricePi + " Pi"
                  : "Free"
                : "Contact the institution for program details."}
            </p>
            {partner &&
            item.capabilities.enroll &&
            program.enrollmentEnabled &&
            (program.pricePi === 0 ||
              (item.piPaymentsEnabled && program.piPaymentsEnabled && isPiPaymentAvailable())) ? (
              <button disabled={busy || !user} onClick={() => void enroll(program)}>
                Enroll{!user ? " (sign in first)" : ""}
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {!data.programs.length ? <p>No published programs yet.</p> : null}
      <h2 id="courses">Courses</h2>
      <div className="institution-grid">
        {data.courses.map(course => (
          <article className="institution-card" key={course.id}>
            <h3>{course.title}</h3>
            <Link to={"/services/education/courses/" + course.slug}>View Course</Link>
          </article>
        ))}
      </div>
      {!data.courses.length ? <p>No published courses yet.</p> : null}
      {partner && item.capabilities.apply ? (
        <form className="institution-panel" onSubmit={apply}>
          <h2>Apply to the institution</h2>
          <label>
            Program
            <select value={programId} onChange={e => setProgramId(e.target.value)}>
              <option value="">General admission</option>
              {data.programs.map(p => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Application statement
            <textarea minLength={10} required value={statement} onChange={e => setStatement(e.target.value)} />
          </label>
          <button disabled={busy || !user}>Submit application</button>
        </form>
      ) : null}
      {payment && partner && item.piPaymentsEnabled && isPiPaymentAvailable() ? (
        <button disabled={busy} onClick={() => void pay()}>
          Pay with Pi / {payment.amount_pi} Pi
        </button>
      ) : null}
      <Link to="/education/institution-learning">My institution learning</Link>
      <h2>Announcements</h2>
      {data.announcements.map(row => (
        <article className="institution-panel" key={row.id}>
          <h3>{row.title}</h3>
          <p>{row.body}</p>
        </article>
      ))}
      {partner && item.capabilities.certificates ? (
        <p>
          Certificates are available for approved programs after confirmed completion. Verify issued certificates
          through SMAJ's existing certificate verification service.
        </p>
      ) : null}
    </EducationShell>
  );
}
export function InstitutionApplicationPage() {
  const [profile, setProfile] = useState<Partial<Institution>>(emptyProfile);
  const [applications, setApplications] = useState<InstitutionApplication[]>([]);
  const [editing, setEditing] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [applicantRole, setApplicantRole] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [programs, setPrograms] = useState("");
  const [courses, setCourses] = useState("");
  const [interest, setInterest] = useState(false);
  const [information, setInformation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => institutionApi.applications().then(result => setApplications(result.applications));
  useEffect(() => {
    void load().catch(error => setMessage(errorText(error)));
  }, []);
  const save = async (status: "draft" | "submitted") => {
    setBusy(true);
    try {
      const body = {
        profile,
        status,
        applicantName,
        applicantRole,
        evidenceUrl,
        programs: commaList(programs),
        courses: commaList(courses),
        piPaymentInterest: interest,
        additionalInformation: information,
      };
      const result = editing
        ? await institutionApi.patch("institution-applications/" + editing, body)
        : await institutionApi.post("institution-applications", body);
      setEditing(status === "draft" ? result.application.id : "");
      setMessage(
        status === "draft"
          ? "Draft saved."
          : "Application submitted for SMAJ review. Submission does not verify an institution."
      );
      await load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const evidence = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      if (
        file.size > 5 * 1024 * 1024 ||
        !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw new Error("Upload a PDF, JPG, PNG, or WebP file up to 5 MB.");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setEvidenceUrl(
        file.type === "application/pdf"
          ? (
              await axiosClient.post<{ url: string }>("/uploads/document", {
                document: data,
                name: file.name,
                purpose: "institution-authorization",
              })
            ).data.url
          : await uploadImage(data, "institution-authorization")
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const edit = (application: InstitutionApplication) => {
    setEditing(application.id);
    setProfile(application.profile);
    setApplicantName(application.applicantName);
    setApplicantRole(application.applicantRole);
    setEvidenceUrl(application.evidenceUrl);
    setPrograms(application.programs.join(", "));
    setCourses(application.courses.join(", "));
    setInterest(application.piPaymentInterest);
    setInformation(application.additionalInformation);
  };
  return (
    <EducationShell>
      <p className="private-kicker">BECOME AN EDUCATION PARTNER</p>
      <h1>Institution application</h1>
      <p>
        Legitimate education providers can apply to join SMAJ. Only authorized SMAJ administrators can approve a
        partnership. Payment interest does not enable Pi payments.
      </p>
      {message ? <p role="status">{message}</p> : null}
      <form
        className="institution-panel"
        onSubmit={e => {
          e.preventDefault();
          void save("submitted");
        }}
      >
        <ProfileFields value={profile} change={setProfile} />
        <div className="institution-form-grid">
          <label>
            Programs offered
            <input value={programs} onChange={e => setPrograms(e.target.value)} />
          </label>
          <label>
            Courses offered
            <input value={courses} onChange={e => setCourses(e.target.value)} />
          </label>
          <label>
            Applicant full name
            <input required value={applicantName} onChange={e => setApplicantName(e.target.value)} />
          </label>
          <label>
            Applicant role/title
            <input required value={applicantRole} onChange={e => setApplicantRole(e.target.value)} />
          </label>
          <label className="wide">
            Proof you are authorized to represent the institution
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={e => void evidence(e.target.files?.[0])}
            />
            <input
              required
              type="url"
              placeholder="Uploaded evidence URL"
              value={evidenceUrl}
              onChange={e => setEvidenceUrl(e.target.value)}
            />
          </label>
          <label className="wide">
            Additional information
            <textarea value={information} onChange={e => setInformation(e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={interest} onChange={e => setInterest(e.target.checked)} />
            Interested in Pi payments
          </label>
        </div>
        <div className="institution-actions">
          <button type="button" disabled={busy} onClick={() => void save("draft")}>
            Save draft
          </button>
          <button disabled={busy}>Submit for review</button>
        </div>
      </form>
      <h2>My applications</h2>
      {applications.map(application => (
        <article className="institution-panel" key={application.id}>
          <h3>{application.profile.name}</h3>
          <p>Status: {application.status}</p>
          <p>{application.reviewNotes}</p>
          {["draft", "needs_information"].includes(application.status) ? (
            <button onClick={() => edit(application)}>Edit / provide information</button>
          ) : null}
        </article>
      ))}
    </EducationShell>
  );
}
export function InstitutionLearningPage() {
  const [rows, setRows] = useState<{ enrollments: InstitutionRecord[]; applications: InstitutionRecord[] } | null>(
    null
  );
  const [message, setMessage] = useState("");
  useEffect(() => {
    void institutionApi
      .learning()
      .then(setRows)
      .catch(e => setMessage(errorText(e)));
  }, []);
  return (
    <EducationShell>
      <h1>My institution learning</h1>
      <p>{message}</p>
      <h2>Enrollments</h2>
      {rows?.enrollments.map(row => (
        <article className="institution-panel" key={row.id}>
          <h3>{row.course_title}</h3>
          <p>{row.status}</p>
          {row.learningInstructions ? <p>{row.learningInstructions}</p> : null}
          {row.course_id && ["active", "completed"].includes(row.status) ? (
            <Link to={"/services/education/courses/learn/" + row.id}>Open course player</Link>
          ) : null}
          {row.learningUrl ? (
            <a href={row.learningUrl} target="_blank" rel="noreferrer">
              Open learning system
            </a>
          ) : null}
          {row.status === "pending_payment" ? (
            <Link
              to={"/education/institutions/" + (row as InstitutionRecord & { institutionId: string }).institutionId}
            >
              Continue enrollment payment
            </Link>
          ) : null}
          {row.certificate_id ? <Link to={"/verify/certificate/" + row.certificate_id}>Verify certificate</Link> : null}
        </article>
      ))}
      <h2>Applications</h2>
      {rows?.applications.map(row => (
        <article className="institution-panel" key={row.id}>
          <p>
            {row.applicantName} / {row.status}
          </p>
          <Link to={"/education/institutions/" + (row as InstitutionRecord & { institutionId: string }).institutionId}>
            View institution
          </Link>
        </article>
      ))}
    </EducationShell>
  );
}

function InstitutionWorkspace({ institutionId, admin = false }: { institutionId: string; admin?: boolean }) {
  const [data, setData] = useState<InstitutionPortalResponse | null>(null),
    [tab, setTab] = useState("Dashboard"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Partial<Institution>>({}),
    [program, setProgram] = useState<Partial<InstitutionProgram>>({
      name: "",
      courseIds: [],
      priceUsdt: 0,
      status: "draft",
    });
  const [course, setCourse] = useState({ title: "", description: "", category: "", copyright_agreed: false });
  const [notes, setNotes] = useState<Record<string, string>>({}),
    [announcement, setAnnouncement] = useState({ title: "", body: "" }),
    [administrator, setAdministrator] = useState("");
  const load = async () => {
    const next = await institutionApi.portal(institutionId);
    setData(next);
    setProfile(next.institution);
  };
  useEffect(() => {
    setData(null);
    void load().catch(e => setMessage(errorText(e)));
  }, [institutionId]);
  const perform = async (action: () => Promise<unknown>, success = "Saved.") => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await load();
      setMessage(success);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const path = "institution-portal/" + institutionId;
  if (!data) return <p role="status">{message || "Loading institution workspace / "}</p>;
  return (
    <section className="institution-workspace">
      <h2>{data.institution.name}</h2>
      <Badge institution={data.institution} />
      <p role="status">{message}</p>
      <nav className="institution-tabs" aria-label="Institution management">
        {[
          "Dashboard",
          "Profile",
          "Programs",
          "Courses",
          "Applications",
          "Students",
          "Enrollments",
          "Payments",
          "Certificates",
          "Announcements",
          "Settings",
        ].map(name => (
          <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === "Dashboard" ? (
        <>
          <div className="institution-grid">
            {Object.entries(data.summary).map(([key, value]) => (
              <article className="institution-card" key={key}>
                <b>{value}</b>
                <p>{key.replace(/([A-Z])/g, " $1")}</p>
              </article>
            ))}
          </div>
          <h3>Recent activity</h3>
          {data.auditHistory.map(row => (
            <p key={row.id}>
              {row.action} / {row.at}
            </p>
          ))}
        </>
      ) : null}
      {tab === "Profile" ? (
        <form
          className="institution-panel"
          onSubmit={e => {
            e.preventDefault();
            void perform(() => institutionApi.patch(path + "/profile", profile));
          }}
        >
          <ProfileFields value={profile} change={setProfile} />
          <button disabled={busy}>Save profile</button>
        </form>
      ) : null}
      {tab === "Programs" ? (
        <>
          <div className="institution-grid">
            {data.programs.map(item => (
              <article className="institution-card" key={item.id}>
                <h3>{item.name}</h3>
                <p>
                  {item.status} / {item.pricePi} Pi
                </p>
                <button onClick={() => setProgram(item)}>Edit program</button>
              </article>
            ))}
          </div>
          <form
            className="institution-panel"
            onSubmit={e => {
              e.preventDefault();
              void perform(async () => {
                if (program.id) await institutionApi.patch(path + "/programs/" + program.id, program);
                else await institutionApi.post(path + "/programs", program);
                setProgram({ name: "", courseIds: [], priceUsdt: 0, status: "draft" });
              });
            }}
          >
            <h3>{program.id ? "Edit program" : "New program"}</h3>
            <div className="institution-form-grid">
              <label>
                Name
                <input
                  required
                  value={program.name || ""}
                  onChange={e => setProgram({ ...program, name: e.target.value })}
                />
              </label>
              <label>
                Fee (USD equivalent; Pi calculated by server)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={program.priceUsdt || 0}
                  onChange={e => setProgram({ ...program, priceUsdt: Number(e.target.value) })}
                />
              </label>
              <label className="wide">
                Description
                <textarea
                  value={program.description || ""}
                  onChange={e => setProgram({ ...program, description: e.target.value })}
                />
              </label>
              <label>
                External LMS / online lesson link
                <input
                  type="url"
                  placeholder="https://"
                  value={program.learningUrl || ""}
                  onChange={e => setProgram({ ...program, learningUrl: e.target.value })}
                />
              </label>
              <label>
                Learning / physical attendance instructions
                <textarea
                  value={program.learningInstructions || ""}
                  onChange={e => setProgram({ ...program, learningInstructions: e.target.value })}
                />
              </label>
              <fieldset className="wide">
                <legend>Courses in this program</legend>
                {data.courses.map(item => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={program.courseIds?.includes(item.id) || false}
                      onChange={e =>
                        setProgram({
                          ...program,
                          courseIds: e.target.checked
                            ? [...(program.courseIds || []), item.id]
                            : (program.courseIds || []).filter(id => id !== item.id),
                        })
                      }
                    />
                    {item.title}
                  </label>
                ))}
              </fieldset>
              <label>
                <input
                  type="checkbox"
                  checked={program.enrollmentEnabled || false}
                  onChange={e => setProgram({ ...program, enrollmentEnabled: e.target.checked })}
                />
                Enable enrollment after approval
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={program.certificateEnabled || false}
                  onChange={e => setProgram({ ...program, certificateEnabled: e.target.checked })}
                />
                Offer completion certificates
              </label>
              {admin ? (
                <>
                  <label>
                    Review status
                    <select
                      value={program.status || "draft"}
                      onChange={e => setProgram({ ...program, status: e.target.value as InstitutionProgram["status"] })}
                    >
                      <option value="draft">Draft</option>
                      <option value="approved">Approved</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={program.piPaymentsEnabled || false}
                      onChange={e => setProgram({ ...program, piPaymentsEnabled: e.target.checked })}
                    />
                    Approve Pi payments for this program
                  </label>
                </>
              ) : (
                <p>Program changes return to draft for SMAJ review. SMAJ approves paid offerings separately.</p>
              )}
            </div>
            <button disabled={busy}>Save program</button>
            {program.id ? (
              <button
                type="button"
                onClick={() => setProgram({ name: "", courseIds: [], priceUsdt: 0, status: "draft" })}
              >
                New program
              </button>
            ) : null}
          </form>
        </>
      ) : null}
      {tab === "Courses" ? (
        <>
          <div className="institution-grid">
            {data.courses.map(item => (
              <article className="institution-card" key={item.id}>
                <h3>{item.title}</h3>
                <p>{(item as typeof item & { status?: string }).status}</p>
                <Link to={"/app/services/education/courses/" + item.id + "/edit"}>Open course builder</Link>
                {admin ? (
                  <div className="institution-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() => axiosClient.patch("/courses/" + item.id, { status: "published" }))
                      }
                    >
                      Approve / publish
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() => axiosClient.patch("/courses/" + item.id, { piPaymentsEnabled: true }))
                      }
                    >
                      Approve Pi payments
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() => axiosClient.patch("/courses/" + item.id, { piPaymentsEnabled: false }))
                      }
                    >
                      Disable Pi payments
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <form
            className="institution-panel"
            onSubmit={e => {
              e.preventDefault();
              void perform(async () => {
                await axiosClient.post("/courses", {
                  ...course,
                  institutionId,
                  provider_type: "institution",
                  course_type: "free",
                });
                setCourse({ title: "", description: "", category: "", copyright_agreed: false });
              }, "Course draft created. Open the existing course builder to add lessons and submit it for review.");
            }}
          >
            <h3>Create course draft</h3>
            <label>
              Title
              <input required value={course.title} onChange={e => setCourse({ ...course, title: e.target.value })} />
            </label>
            <label>
              Description
              <textarea
                required
                value={course.description}
                onChange={e => setCourse({ ...course, description: e.target.value })}
              />
            </label>
            <label>
              Subject/category
              <input
                required
                value={course.category}
                onChange={e => setCourse({ ...course, category: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                required
                checked={course.copyright_agreed}
                onChange={e => setCourse({ ...course, copyright_agreed: e.target.checked })}
              />
              I am authorized to publish this course and its content.
            </label>
            <button disabled={busy}>Create draft</button>
          </form>
        </>
      ) : null}
      {tab === "Applications"
        ? data.applications.map(row => (
            <article className="institution-panel" key={row.id}>
              <h3>{row.applicantName}</h3>
              <p>{row.statement}</p>
              <p>{row.status}</p>
              <label>
                Review notes
                <textarea
                  value={notes[row.id] || ""}
                  onChange={e => setNotes({ ...notes, [row.id]: e.target.value })}
                />
              </label>
              <div className="institution-actions">
                {["under_review", "needs_information", "accepted", "rejected"].map(status => (
                  <button
                    disabled={busy}
                    key={status}
                    onClick={() =>
                      void perform(() =>
                        institutionApi.patch(path + "/applications/" + row.id, { status, reviewNotes: notes[row.id] })
                      )
                    }
                  >
                    {status.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
            </article>
          ))
        : null}
      {tab === "Students"
        ? [...new Set(data.enrollments.map(row => row.user_id))].map(student => (
            <article className="institution-card" key={student}>
              <h3>Student {student}</h3>
              <p>{data.enrollments.filter(row => row.user_id === student).length} enrollments</p>
            </article>
          ))
        : null}
      {tab === "Enrollments"
        ? data.enrollments.map(row => (
            <article className="institution-panel" key={row.id}>
              <h3>{row.course_title}</h3>
              <p>
                Student: {row.user_id} / {row.status}
              </p>
              {row.programId && row.status === "active" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() => institutionApi.patch(path + "/enrollments/" + row.id, { status: "completed" }))
                  }
                >
                  Confirm program completion
                </button>
              ) : null}
              {row.programId && row.status === "completed" && data.institution.capabilities.certificates ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() => institutionApi.post(path + "/enrollments/" + row.id + "/certificate", {}))
                  }
                >
                  Issue completion certificate
                </button>
              ) : null}
            </article>
          ))
        : null}
      {tab === "Payments" ? (
        <>
          <p>
            Statuses are confirmed by the existing Pi payment service. Institution administrators cannot mark payments
            paid.
          </p>
          {data.payments.map(row => (
            <article className="institution-panel" key={row.id}>
              <h3>{row.course_title}</h3>
              <p>
                {row.amount_pi} Pi / {row.status}
              </p>
              <p>
                Payment: {row.payment_id} / Student: {row.user_id}
              </p>
            </article>
          ))}
        </>
      ) : null}
      {tab === "Certificates"
        ? data.certificates.map(row => (
            <article className="institution-panel" key={row.id}>
              <h3>{row.course_title}</h3>
              <p>{row.status}</p>
              <Link to={"/verify/certificate/" + row.certificate_id}>Verify {row.certificate_id}</Link>
              {admin ? (
                <>
                  <label>
                    Revocation reason
                    <input
                      value={notes[row.id] || ""}
                      onChange={e => setNotes({ ...notes, [row.id]: e.target.value })}
                    />
                  </label>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        institutionApi.patch("admin/institution-certificates/" + row.id, {
                          status: row.status === "valid" ? "revoked" : "valid",
                          reason: notes[row.id],
                        })
                      )
                    }
                  >
                    {row.status === "valid" ? "Revoke" : "Restore"}
                  </button>
                </>
              ) : null}
            </article>
          ))
        : null}
      {tab === "Announcements" ? (
        <>
          <form
            className="institution-panel"
            onSubmit={e => {
              e.preventDefault();
              void perform(async () => {
                await institutionApi.post(path + "/announcements", announcement);
                setAnnouncement({ title: "", body: "" });
              });
            }}
          >
            <label>
              Title
              <input
                required
                value={announcement.title}
                onChange={e => setAnnouncement({ ...announcement, title: e.target.value })}
              />
            </label>
            <label>
              Announcement
              <textarea
                required
                value={announcement.body}
                onChange={e => setAnnouncement({ ...announcement, body: e.target.value })}
              />
            </label>
            <button disabled={busy}>Publish announcement</button>
          </form>
          {data.announcements.map(row => (
            <article className="institution-panel" key={row.id}>
              <h3>{row.title}</h3>
              <p>{row.body}</p>
            </article>
          ))}
        </>
      ) : null}
      {tab === "Settings" ? (
        <section className="institution-panel">
          <h3>Institution permissions</h3>
          {admin ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                void perform(() => institutionApi.patch("admin/institutions/" + institutionId, profile));
              }}
            >
              <label>
                Partnership
                <select
                  value={profile.partnerStatus}
                  onChange={e =>
                    setProfile({ ...profile, partnerStatus: e.target.value as Institution["partnerStatus"] })
                  }
                >
                  <option value="directory">Not yet a SMAJ partner</option>
                  <option value="smaj_verified_partner">SMAJ verified partner</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={profile.status}
                  onChange={e => setProfile({ ...profile, status: e.target.value as Institution["status"] })}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
              {(["apply", "enroll", "certificates"] as const).map(key => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={profile.capabilities?.[key] || false}
                    onChange={e =>
                      setProfile({ ...profile, capabilities: { ...profile.capabilities!, [key]: e.target.checked } })
                    }
                  />
                  Enable {key}
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={profile.piPaymentsEnabled || false}
                  onChange={e => setProfile({ ...profile, piPaymentsEnabled: e.target.checked })}
                />
                Enable institution Pi payments
              </label>
              <button disabled={busy}>Save permissions</button>
            </form>
          ) : (
            <>
              <p>Partnership, Pi payments and institution capabilities are approved by SMAJ administrators.</p>
              <p>
                Applications: {data.institution.capabilities.apply ? "enabled" : "disabled"}; enrollment:{" "}
                {data.institution.capabilities.enroll ? "enabled" : "disabled"}; certificates:{" "}
                {data.institution.capabilities.certificates ? "enabled" : "disabled"}; Pi payments:{" "}
                {data.institution.piPaymentsEnabled ? "enabled" : "disabled"}.
              </p>
            </>
          )}
          {admin ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                void perform(() =>
                  institutionApi.post("admin/institutions/" + institutionId + "/administrators", {
                    userId: administrator,
                    status: "active",
                  })
                );
              }}
            >
              <h3>Institution administrators</h3>
              <label>
                Existing user ID
                <input required value={administrator} onChange={e => setAdministrator(e.target.value)} />
              </label>
              <div className="institution-actions">
                <button disabled={busy}>Grant institution access</button>
                <button
                  type="button"
                  disabled={busy || !administrator}
                  onClick={() =>
                    void perform(() =>
                      institutionApi.post("admin/institutions/" + institutionId + "/administrators", {
                        userId: administrator,
                        status: "revoked",
                      })
                    )
                  }
                >
                  Revoke institution access
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
export function InstitutionPortalPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void institutionApi
      .portalList()
      .then(result => {
        setInstitutions(result.institutions);
        setSelected(result.institutions[0]?.id || "");
      })
      .catch(e => setError(errorText(e)));
  }, []);
  return (
    <EducationShell>
      <h1>Institution portal</h1>
      <p>{error}</p>
      {institutions.length ? (
        <>
          <label>
            Institution
            <select value={selected} onChange={e => setSelected(e.target.value)}>
              {institutions.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <InstitutionWorkspace key={selected} institutionId={selected} />
        </>
      ) : (
        <p>
          Your approved institution memberships will appear here.{" "}
          <Link to="/education/institutions/apply">Apply for a partnership</Link>
        </p>
      )}
    </EducationShell>
  );
}
export function AdminInstitutionsPage() {
  const [data, setData] = useState<{ institutions: Institution[]; applications: InstitutionApplication[] } | null>(
      null
    ),
    [selected, setSelected] = useState(""),
    [profile, setProfile] = useState<Partial<Institution>>(emptyProfile),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState<Record<string, string>>({});
  const load = () => institutionApi.admin().then(setData);
  useEffect(() => {
    void load().catch(e => setMessage(errorText(e)));
  }, []);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
      setMessage("Saved.");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="institution-content institution-admin">
      <h1>Education institutions</h1>
      <p>Review providers and partnership applications. Universities keep their existing management area.</p>
      <Link to="/admin/universities">Manage universities</Link>
      <p role="status">{message}</p>
      <h2>Institutions</h2>
      <label>
        Manage institution
        <select value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">Choose an institution</option>
          {data?.institutions.map(item => (
            <option value={item.id} key={item.id}>
              {item.name} / {item.status}
            </option>
          ))}
        </select>
      </label>
      {selected ? <InstitutionWorkspace key={selected} institutionId={selected} admin /> : null}
      <details className="institution-panel">
        <summary>Add informational institution</summary>
        <form
          onSubmit={e => {
            e.preventDefault();
            void perform(async () => {
              await institutionApi.post("admin/institutions", profile);
              setProfile(emptyProfile);
            });
          }}
        >
          <ProfileFields value={profile} change={setProfile} />
          <button disabled={busy}>Add institution</button>
          <p>New directory listings have no enrollment, payment, or certificate permissions.</p>
        </form>
      </details>
      <h2>Partnership applications</h2>
      {data?.applications.map(item => (
        <article className="institution-panel" key={item.id}>
          <h3>{item.profile.name}</h3>
          <p>
            {institutionTypes[item.profile.institutionType]} / {item.profile.country} / {item.status}
          </p>
          <p>{item.profile.description}</p>
          <p>
            {item.applicantName} / {item.applicantRole} / {item.profile.email} / {item.profile.phone}
          </p>
          {item.profile.website ? (
            <a href={item.profile.website} target="_blank" rel="noreferrer">
              Official website
            </a>
          ) : null}
          <p>
            Programs: {item.programs.join(", ")}; courses: {item.courses.join(", ")}
          </p>
          <p>Pi interest: {item.piPaymentInterest ? "Yes" : "No"}</p>
          <p>{item.additionalInformation}</p>
          {item.evidenceUrl ? (
            <a href={item.evidenceUrl} target="_blank" rel="noreferrer">
              Review authorization evidence
            </a>
          ) : null}
          <p>{item.reviewNotes}</p>
          {["submitted", "under_review", "needs_information"].includes(item.status) ? (
            <>
              <label>
                Decision / information requested
                <textarea
                  value={notes[item.id] || ""}
                  onChange={e => setNotes({ ...notes, [item.id]: e.target.value })}
                />
              </label>
              <div className="institution-actions">
                {["under_review", "needs_information", "approved", "rejected"].map(status => (
                  <button
                    key={status}
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        institutionApi.patch("admin/institution-applications/" + item.id, {
                          status,
                          reviewNotes: notes[item.id],
                        })
                      )
                    }
                  >
                    {status.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {item.institutionId ? (
            <button onClick={() => setSelected(item.institutionId!)}>Manage approved institution</button>
          ) : null}
        </article>
      ))}
    </main>
  );
}
