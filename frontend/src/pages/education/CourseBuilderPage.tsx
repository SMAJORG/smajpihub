import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import AppLayout from "../../layouts/AppLayout";
import EducationHeader from "./EducationHeader";
import EducationBackBar from "../../components/education/EducationBackBar";
import { createCourse, getCourse, submitCourseForReview, updateCourse, uploadCourseVideo } from "../../lib/coursesApi";
import { uploadImage } from "../../lib/uploadImage";
import type { CourseLevel, CourseModule, CourseType, LessonType } from "../../types/courses";
import "../../components/education/courses.css";

const emptyLesson = (order: number) => ({
  title: "",
  description: "",
  order,
  type: "video" as LessonType,
  duration: "",
  required: true,
  preview: false,
  content: "",
  video_url: "",
  video_provider: "",
  video_asset_id: "",
  video_playback_id: "",
  document_url: "",
  external_url: "",
  resources: [] as string[],
});

const emptyModule = (order: number): CourseModule => ({ title: "", description: "", order, lessons: [emptyLesson(1)] });

const CourseBuilderPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(courseId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUpload, setVideoUpload] = useState<{ key: string; progress: number } | null>(null);
  const [message, setMessage] = useState("");
  const [institutionId, setInstitutionId] = useState<string>();
  const [createdId, setCreatedId] = useState("");
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    short_description: "",
    description: "",
    category: "Technology",
    subcategory: "",
    course_type: "free" as CourseType,
    price_usdt: 0,
    language: "en",
    level: "beginner" as CourseLevel,
    estimated_duration: "",
    thumbnail_url: "",
    cover_url: "",
    promotional_video: "",
    learning_objectives: "",
    requirements: "",
    target_audience: "",
    tags: "",
    certificate_enabled: true,
    required_lessons_percentage: 100,
    require_all_required_lessons: true,
    require_quizzes: false,
    minimum_quiz_score: 70,
    copyright_agreed: false,
    modules: [emptyModule(1)],
  });

  useEffect(() => {
    if (!courseId) return;
    getCourse(courseId)
      .then(course => {
        if (!course) return setMessage("Course not found.");
        setInstitutionId(course.institutionId);
        setForm(current => ({
          ...current,
          title: course.title,
          subtitle: course.subtitle || "",
          short_description: course.short_description || "",
          description: course.description,
          category: course.category,
          subcategory: course.subcategory || "",
          course_type: course.course_type,
          price_usdt: course.price_usdt,
          language: course.language,
          level: course.level,
          estimated_duration: course.estimated_duration || "",
          thumbnail_url: course.thumbnail_url || "",
          cover_url: course.cover_url || "",
          promotional_video: course.promotional_video || "",
          learning_objectives: (course.learning_objectives || []).join("\n"),
          requirements: (course.requirements || []).join("\n"),
          target_audience: (course.target_audience || []).join("\n"),
          tags: course.tags.join(", "),
          certificate_enabled: course.certificate_enabled,
          required_lessons_percentage: course.completion_rules.required_lessons_percentage,
          require_all_required_lessons: course.completion_rules.require_all_required_lessons,
          require_quizzes: course.completion_rules.require_quizzes,
          minimum_quiz_score: course.completion_rules.minimum_quiz_score || 70,
          copyright_agreed: course.copyright_agreed,
          modules: course.modules.length ? course.modules : [emptyModule(1)],
        }));
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not load course"));
  }, [courseId]);

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(current => ({ ...current, [key]: value }));
  const updateModule = (moduleIndex: number, changes: Partial<CourseModule>) =>
    setForm(current => ({
      ...current,
      modules: current.modules.map((module, index) => (index === moduleIndex ? { ...module, ...changes } : module)),
    }));
  const updateLesson = (moduleIndex: number, lessonIndex: number, changes: Record<string, unknown>) =>
    setForm(current => ({
      ...current,
      modules: current.modules.map((module, index) =>
        index === moduleIndex
          ? {
              ...module,
              lessons: module.lessons.map((lesson, index) =>
                index === lessonIndex ? { ...lesson, ...changes } : lesson
              ),
            }
          : module
      ),
    }));
  const addModule = () => setField("modules", [...form.modules, emptyModule(form.modules.length + 1)]);
  const removeModule = (moduleIndex: number) =>
    setField(
      "modules",
      form.modules.filter((_, index) => index !== moduleIndex).map((module, index) => ({ ...module, order: index + 1 }))
    );
  const addLesson = (moduleIndex: number) =>
    updateModule(moduleIndex, {
      lessons: [...form.modules[moduleIndex].lessons, emptyLesson(form.modules[moduleIndex].lessons.length + 1)],
    });
  const removeLesson = (moduleIndex: number, lessonIndex: number) =>
    updateModule(moduleIndex, {
      lessons: form.modules[moduleIndex].lessons
        .filter((_, index) => index !== lessonIndex)
        .map((lesson, index) => ({ ...lesson, order: index + 1 })),
    });

  const uploadThumbnail = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
      });
      setField("thumbnail_url", await uploadImage(dataUrl, "course-thumbnail"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadLessonVideo = async (moduleIndex: number, lessonIndex: number, file?: File) => {
    if (!file) return;
    if (!form.copyright_agreed) {
      setMessage("Confirm the publishing-rights checkbox before uploading a course video.");
      return;
    }
    const key = `${moduleIndex}-${lessonIndex}`;
    setMessage("");
    setVideoUpload({ key, progress: 0 });
    try {
      const uploaded = await uploadCourseVideo(file, true, progress => setVideoUpload({ key, progress }), institutionId);
      updateLesson(moduleIndex, lessonIndex, {
        video_url: uploaded.playbackUrl,
        video_provider: "cloudflare",
        video_asset_id: uploaded.uid,
        video_playback_id: uploaded.uid,
      });
      setMessage("Video uploaded. Cloudflare may need a few moments to finish processing it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Video upload failed");
    } finally {
      setVideoUpload(null);
    }
  };
  const payload = () => ({
    ...form,
    learning_objectives: form.learning_objectives
      .split("\n")
      .map(value => value.trim())
      .filter(Boolean),
    requirements: form.requirements
      .split("\n")
      .map(value => value.trim())
      .filter(Boolean),
    target_audience: form.target_audience
      .split("\n")
      .map(value => value.trim())
      .filter(Boolean),
    tags: form.tags
      .split(",")
      .map(value => value.trim())
      .filter(Boolean),
    completion_rules: {
      required_lessons_percentage: form.required_lessons_percentage,
      require_all_required_lessons: form.require_all_required_lessons,
      require_quizzes: form.require_quizzes,
      minimum_quiz_score: form.minimum_quiz_score,
      require_final_assessment: false,
      require_project: false,
    },
  });

  const save = async (submit = false) => {
    if (!form.title.trim() || !form.description.trim() || !form.category.trim())
      return setMessage("Title, description, and category are required.");
    if (!editing && !form.copyright_agreed)
      return setMessage("Confirm that you own or may publish this course content.");
    setSaving(true);
    setMessage("");
    try {
      const course = editing && courseId ? await updateCourse(courseId, payload()) : await createCourse(payload());
      setCreatedId(course.id);
      if (submit) {
        await submitCourseForReview(course.id);
        setMessage("Course saved and submitted for review.");
      } else {
        setMessage("Course saved as a draft.");
      }
      if (!editing) navigate(`/app/services/education/courses/${course.id}/edit`, { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout showHeader={false} showFooter={false}>
      <main className="courses-page course-builder-page">
        <EducationHeader query="" onQueryChange={() => undefined} searchPath="/services/education/courses" />
        <EducationBackBar current={editing ? "Edit Course" : "Create Course"} />
        <div className="course-builder-heading">
          <div>
            <span className="courses-kicker">INSTRUCTOR STUDIO</span>
            <h1>{editing ? "Edit your course" : "Create an online course"}</h1>
            <p>Build clear lessons, set completion rules, and submit when your course is ready.</p>
          </div>
          <div className="course-builder-actions">
            <button className="course-secondary-btn" disabled={saving || uploading} onClick={() => void save(false)}>
              <SaveOutlinedIcon /> Save Draft
            </button>
            <button className="course-primary-btn" disabled={saving || uploading} onClick={() => void save(true)}>
              Submit for Review
            </button>
          </div>
        </div>
        {message && (
          <div
            className={`course-alert ${message.includes("saved") || message.includes("submitted") ? "success" : "error"}`}
          >
            {message}
          </div>
        )}

        <section className="course-builder-section">
          <h2>1. Course information</h2>
          <div className="course-builder-grid">
            <label>
              Course title
              <input value={form.title} onChange={event => setField("title", event.target.value)} required />
            </label>
            <label>
              Subtitle
              <input value={form.subtitle} onChange={event => setField("subtitle", event.target.value)} />
            </label>
            <label className="wide">
              Short description
              <input
                value={form.short_description}
                onChange={event => setField("short_description", event.target.value)}
              />
            </label>
            <label className="wide">
              Full description
              <textarea
                rows={6}
                value={form.description}
                onChange={event => setField("description", event.target.value)}
                required
              />
            </label>
            <label>
              Category
              <select value={form.category} onChange={event => setField("category", event.target.value)}>
                <option>Technology</option>
                <option>Business</option>
                <option>Exam Prep</option>
                <option>Design</option>
                <option>AI</option>
                <option>Cybersecurity</option>
                <option>Marketing</option>
                <option>Languages</option>
                <option>Finance</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Subcategory
              <input value={form.subcategory} onChange={event => setField("subcategory", event.target.value)} />
            </label>
            <label>
              Level
              <select value={form.level} onChange={event => setField("level", event.target.value as CourseLevel)}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="all">All levels</option>
              </select>
            </label>
            <label>
              Language
              <input value={form.language} onChange={event => setField("language", event.target.value)} />
            </label>
            <label>
              Estimated duration
              <input
                placeholder="Example: 6 weeks"
                value={form.estimated_duration}
                onChange={event => setField("estimated_duration", event.target.value)}
              />
            </label>
            <label>
              Promotional video URL
              <input
                type="url"
                value={form.promotional_video}
                onChange={event => setField("promotional_video", event.target.value)}
              />
            </label>
            <label>
              Thumbnail image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={event => void uploadThumbnail(event.target.files?.[0])}
              />
              <small>{uploading ? "Uploading..." : form.thumbnail_url || "JPG, PNG, or WebP"}</small>
            </label>
            <label>
              Cover image URL
              <input type="url" value={form.cover_url} onChange={event => setField("cover_url", event.target.value)} />
            </label>
            <label className="wide">
              Learning objectives
              <textarea
                rows={4}
                placeholder="One objective per line"
                value={form.learning_objectives}
                onChange={event => setField("learning_objectives", event.target.value)}
              />
            </label>
            <label>
              Requirements
              <textarea
                rows={4}
                placeholder="One requirement per line"
                value={form.requirements}
                onChange={event => setField("requirements", event.target.value)}
              />
            </label>
            <label>
              Target learners
              <textarea
                rows={4}
                placeholder="One audience per line"
                value={form.target_audience}
                onChange={event => setField("target_audience", event.target.value)}
              />
            </label>
            <label className="wide">
              Tags
              <input
                placeholder="html, web, beginner"
                value={form.tags}
                onChange={event => setField("tags", event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="course-builder-section">
          <h2>2. Pricing and certificates</h2>
          <div className="course-builder-grid">
            <label>
              Course type
              <select
                value={form.course_type}
                onChange={event => setField("course_type", event.target.value as CourseType)}
              >
                <option value="free">Free</option>
                <option value="paid">Paid with Pi</option>
              </select>
            </label>
            <label>
              Reference price (USDT)
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={form.course_type === "free"}
                value={form.price_usdt}
                onChange={event => setField("price_usdt", Number(event.target.value))}
              />
            </label>
            <label className="course-builder-check">
              <input
                type="checkbox"
                checked={form.certificate_enabled}
                onChange={event => setField("certificate_enabled", event.target.checked)}
              />{" "}
              Completion certificate enabled
            </label>
            <label>
              Lessons required (%)
              <input
                type="number"
                min="1"
                max="100"
                value={form.required_lessons_percentage}
                onChange={event => setField("required_lessons_percentage", Number(event.target.value))}
              />
            </label>
            <label className="course-builder-check">
              <input
                type="checkbox"
                checked={form.require_all_required_lessons}
                onChange={event => setField("require_all_required_lessons", event.target.checked)}
              />{" "}
              Require every required lesson
            </label>
            <label className="course-builder-check">
              <input
                type="checkbox"
                checked={form.require_quizzes}
                onChange={event => setField("require_quizzes", event.target.checked)}
              />{" "}
              Require quizzes
            </label>
            {form.require_quizzes && (
              <label>
                Minimum quiz score
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.minimum_quiz_score}
                  onChange={event => setField("minimum_quiz_score", Number(event.target.value))}
                />
              </label>
            )}
          </div>
        </section>

        <section className="course-builder-section">
          <div className="course-builder-section-title">
            <h2>3. Curriculum</h2>
            <button className="course-secondary-btn" onClick={addModule}>
              <AddOutlinedIcon /> Add Module
            </button>
          </div>
          {form.modules.map((module, moduleIndex) => (
            <div className="course-builder-module" key={moduleIndex}>
              <div className="course-builder-module-head">
                <strong>Module {moduleIndex + 1}</strong>
                {form.modules.length > 1 && (
                  <button aria-label="Remove module" onClick={() => removeModule(moduleIndex)}>
                    <DeleteOutlineOutlinedIcon />
                  </button>
                )}
              </div>
              <div className="course-builder-grid">
                <label>
                  Module title
                  <input
                    value={module.title}
                    onChange={event => updateModule(moduleIndex, { title: event.target.value })}
                  />
                </label>
                <label>
                  Module description
                  <input
                    value={module.description || ""}
                    onChange={event => updateModule(moduleIndex, { description: event.target.value })}
                  />
                </label>
              </div>
              {module.lessons.map((lesson, lessonIndex) => (
                <div className="course-builder-lesson" key={lessonIndex}>
                  <div className="course-builder-lesson-head">
                    <strong>Lesson {lessonIndex + 1}</strong>
                    {module.lessons.length > 1 && (
                      <button aria-label="Remove lesson" onClick={() => removeLesson(moduleIndex, lessonIndex)}>
                        <DeleteOutlineOutlinedIcon />
                      </button>
                    )}
                  </div>
                  <div className="course-builder-grid">
                    <label>
                      Lesson title
                      <input
                        value={lesson.title}
                        onChange={event => updateLesson(moduleIndex, lessonIndex, { title: event.target.value })}
                      />
                    </label>
                    <label>
                      Type
                      <select
                        value={lesson.type}
                        onChange={event =>
                          updateLesson(moduleIndex, lessonIndex, { type: event.target.value as LessonType })
                        }
                      >
                        <option value="video">Video</option>
                        <option value="text">Text</option>
                        <option value="pdf">PDF</option>
                        <option value="quiz">Quiz</option>
                        <option value="assignment">Assignment</option>
                        <option value="external">External link</option>
                      </select>
                    </label>
                    <label>
                      Duration
                      <input
                        placeholder="10 min"
                        value={lesson.duration || ""}
                        onChange={event => updateLesson(moduleIndex, lessonIndex, { duration: event.target.value })}
                      />
                    </label>
                    <label className="course-builder-check">
                      <input
                        type="checkbox"
                        checked={lesson.required}
                        onChange={event => updateLesson(moduleIndex, lessonIndex, { required: event.target.checked })}
                      />{" "}
                      Required lesson
                    </label>
                    <label className="course-builder-check">
                      <input
                        type="checkbox"
                        checked={lesson.preview}
                        onChange={event => updateLesson(moduleIndex, lessonIndex, { preview: event.target.checked })}
                      />{" "}
                      Free preview
                    </label>
                    {lesson.type === "video" && (
                      <div className="wide course-video-source">
                        <label>
                          Upload lesson video
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime"
                            disabled={videoUpload !== null}
                            onChange={event => void uploadLessonVideo(moduleIndex, lessonIndex, event.target.files?.[0])}
                          />
                        </label>
                        {videoUpload?.key === `${moduleIndex}-${lessonIndex}` && (
                          <div className="course-video-upload-progress" role="status">
                            <span style={{ width: `${videoUpload.progress}%` }} />
                            <strong>{videoUpload.progress}% uploaded</strong>
                          </div>
                        )}
                        {lesson.video_provider === "cloudflare" && lesson.video_playback_id && (
                          <p className="course-video-uploaded">Video uploaded securely · ID {lesson.video_playback_id}</p>
                        )}
                        <label>
                          Or use a direct video URL
                          <input
                            type="url"
                            value={lesson.video_provider === "cloudflare" ? "" : lesson.video_url || ""}
                            placeholder="https://example.com/lesson.mp4"
                            onChange={event => updateLesson(moduleIndex, lessonIndex, {
                              video_url: event.target.value,
                              video_provider: "external",
                              video_asset_id: "",
                              video_playback_id: "",
                            })}
                          />
                        </label>
                        <small>MP4, WebM, or MOV · maximum 200 MB. Confirm publishing rights below before uploading.</small>
                      </div>
                    )}
                    {lesson.type === "text" && (
                      <label className="wide">
                        Lesson content
                        <textarea
                          rows={5}
                          value={lesson.content || ""}
                          onChange={event => updateLesson(moduleIndex, lessonIndex, { content: event.target.value })}
                        />
                      </label>
                    )}
                    {lesson.type === "pdf" && (
                      <label className="wide">
                        PDF URL
                        <input
                          type="url"
                          value={lesson.document_url || ""}
                          onChange={event =>
                            updateLesson(moduleIndex, lessonIndex, { document_url: event.target.value })
                          }
                        />
                      </label>
                    )}
                    {lesson.type === "external" && (
                      <label className="wide">
                        External URL
                        <input
                          type="url"
                          value={lesson.external_url || ""}
                          onChange={event =>
                            updateLesson(moduleIndex, lessonIndex, { external_url: event.target.value })
                          }
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
              <button className="course-secondary-btn" onClick={() => addLesson(moduleIndex)}>
                <AddOutlinedIcon /> Add Lesson
              </button>
            </div>
          ))}
        </section>

        {!editing && (
          <label className="course-builder-rights">
            <input
              type="checkbox"
              checked={form.copyright_agreed}
              onChange={event => setField("copyright_agreed", event.target.checked)}
            />{" "}
            I confirm that I own this content or have permission to publish it.
          </label>
        )}
        <div className="course-builder-bottom-actions">
          <button className="course-secondary-btn" disabled={saving || uploading} onClick={() => void save(false)}>
            <SaveOutlinedIcon /> Save Draft
          </button>
          <button className="course-primary-btn" disabled={saving || uploading} onClick={() => void save(true)}>
            {saving ? "Saving..." : "Submit for Review"}
          </button>
        </div>
        {createdId && <p className="course-builder-created">Course ID: {createdId}</p>}
      </main>
    </AppLayout>
  );
};

export default CourseBuilderPage;
