import { isAxiosError } from "axios";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useBlocker, useNavigate } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import { formatPiAmount, formatUsdAmount } from "../../lib/formatters";
import { formatPiRate, piFromUsdt, usdtFromPi } from "../../lib/piPricing";
import { uploadImage, uploadImages } from "../../lib/uploadImage";
import type { Product } from "../../types/marketplace";
import { LocationFields } from "../../components/LocationFields";
import { productSteps, productIssues, restoredProductStep, type ProductIssue } from "../../lib/productWizard";
import "./AddProductPage.css";

const MAX_PRODUCT_IMAGES = 12;
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const PRODUCT_DRAFT_KEY = "smaj_add_product_draft";
const PRODUCT_STEP_KEY = PRODUCT_DRAFT_KEY + "_step";
const categoryNames = ["Fashion & Clothing", "Electronics", "Cars & Vehicles", "Home & Living", "Beauty & Health", "Sports & Outdoors", "Books & Education", "Digital Products", "Services"] as const;
type CategoryName = (typeof categoryNames)[number];
const categoryFields: Record<CategoryName, string[]> = {
  "Fashion & Clothing": ["Brand", "Gender", "Color", "Size", "Material", "Pattern", "Sleeve Length", "Fit"],
  Electronics: ["Brand", "Model", "Color", "Storage", "RAM", "Processor", "Screen Size", "Battery"],
  "Cars & Vehicles": ["Brand", "Model", "Year", "Mileage", "Fuel Type", "Transmission", "Engine Size", "Exterior Color", "Interior Color"],
  "Home & Living": ["Brand", "Material", "Color", "Dimensions", "Weight"],
  "Beauty & Health": ["Brand", "Expiry Date", "Size"],
  "Sports & Outdoors": ["Brand", "Size", "Material", "Color"],
  "Books & Education": ["Author", "Publisher", "Language", "ISBN", "Edition"],
  "Digital Products": ["File Type", "Version", "License Type", "Download Limit"],
  Services: ["Service Category", "Duration", "Delivery Method", "Availability"],
};
const titleSignals: Array<{ category: CategoryName; words: string[]; fields?: string[]; variants?: string[] }> = [
  { category: "Fashion & Clothing", words: ["t-shirt", "tshirt", "shirt"], fields: ["Brand", "Gender", "Color", "Size", "Material", "Pattern", "Sleeve Length", "Fit"], variants: ["size", "color"] },
  { category: "Fashion & Clothing", words: ["shoe", "shoes", "sneaker", "sandals", "boot"], fields: ["Brand", "Gender", "Shoe Size", "Color", "Material", "Fit"], variants: ["size", "color"] },
  { category: "Fashion & Clothing", words: ["bag", "handbag", "backpack"], fields: ["Brand", "Material", "Color", "Capacity", "Style"], variants: ["color", "style"] },
  { category: "Fashion & Clothing", words: ["pants", "jeans", "cap", "watch", "jewelry", "dress"], variants: ["size", "color"] },
  { category: "Electronics", words: ["laptop", "computer", "pc"], fields: ["Brand", "Model", "Processor", "RAM", "Storage", "GPU", "Screen Size", "Battery"], variants: ["storage", "ram", "color"] },
  { category: "Electronics", words: ["phone", "iphone", "samsung", "tablet"], fields: ["Brand", "Model", "Storage", "RAM", "Color", "Battery"], variants: ["storage", "color"] },
  { category: "Electronics", words: ["tv", "camera", "headphone", "speaker", "console", "gaming"], variants: ["model", "color"] },
  { category: "Cars & Vehicles", words: ["car", "suv", "van", "truck", "motorcycle", "bicycle", "boat", "airplane", "spare part"], fields: ["Brand", "Model", "Year", "Mileage", "Engine Size", "Fuel Type", "Transmission", "Exterior Color", "Interior Color"] },
  { category: "Home & Living", words: ["sofa", "bed", "table", "chair", "furniture", "kitchen", "decor", "lighting"] },
  { category: "Beauty & Health", words: ["makeup", "skincare", "haircare", "perfume", "medical"] },
  { category: "Sports & Outdoors", words: ["football", "basketball", "gym", "camping", "fishing", "cycling"] },
  { category: "Books & Education", words: ["book", "magazine", "course", "study"] },
  { category: "Digital Products", words: ["software", "template", "ebook", "graphic", "source code", "download"] },
  { category: "Services", words: ["design", "programming", "translation", "marketing", "tutoring", "cleaning", "repair", "consulting", "service"] },
];
const selectOptionsByField: Record<string, string[]> = {
  color: ["Black", "White", "Gray", "Silver", "Blue", "Red", "Green", "Yellow", "Pink", "Purple", "Brown", "Gold", "Orange", "Multicolor", "Other"],
  size: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45", "One Size", "Other"],
  "shoe size": ["EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45", "EU 46", "US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12", "Other"],
};
const productColors = [
  ["Black", "#111827"], ["White", "#ffffff"], ["Gray", "#6b7280"], ["Silver", "#c0c0c0"],
  ["Blue", "#2563eb"], ["Red", "#dc2626"], ["Green", "#16a34a"], ["Yellow", "#facc15"],
  ["Pink", "#ec4899"], ["Purple", "#9333ea"], ["Brown", "#8b5a2b"], ["Gold", "#d4a017"],
  ["Orange", "#f97316"], ["Beige", "#e7d7bd"], ["Navy", "#172554"], ["Teal", "#0f766e"],
] as const;
const variantFields = ["color", "size", "material", "storage", "ram", "weight", "model", "edition", "style"] as const;
type VariantRow = Record<(typeof variantFields)[number], string> & { stock: string; priceUsdt: string; image: string };
const emptyVariant = (): VariantRow => ({ color: "", size: "", material: "", storage: "", ram: "", weight: "", model: "", edition: "", style: "", stock: "0", priceUsdt: "", image: "" });
const trimAmount = (value: number, decimals: number) => Number.isFinite(value) && value > 0 ? value.toFixed(decimals).replace(/\.?0+$/, "") : "";
const categoryToApiCategory = (category: CategoryName) => category === "Fashion & Clothing" ? "Fashion" : category === "Cars & Vehicles" ? "Vehicles" : category === "Digital Products" ? "Digital" : category;

const compressProductImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reject;
  reader.onload = () => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Image compression is unavailable."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/webp", .82));
    };
    image.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
});

const initialForm = {
  title: "",
  image: "",
  images: [] as string[],
  priceUsdt: "",
  pricePi: "",
  description: "",
  category: "Fashion & Clothing" as CategoryName,
  condition: "New",
  quantity: "1",
  country: "",
  stateRegion: "",
  city: "",
  areaAddress: "",
  deliveryOption: "Delivery",
  productStatus: "active" as "draft" | "active" | "out_of_stock" | "hidden",
  warranty: "No Warranty",
  returnPolicy: "No Returns",
  specifications: {} as Record<string, string>,
  variants: [] as VariantRow[],
  shipping: { weight: "", dimensions: "", method: "Standard Delivery", deliveryTime: "", pickupAvailable: false },
  digitalProduct: { enabled: false, fileUrl: "", downloadLimit: "", licenseKey: "" },
  serviceDetails: { enabled: false, duration: "", locationType: "Offline", appointmentRequired: false },
  sellerContact: "",
  sellerAgreementAccepted: false,
};

const ColorPicker = ({ value, onChange, multiple = false }: { value: string; onChange: (value: string) => void; multiple?: boolean }) => {
  const selected = value.split(",").map((item) => item.trim()).filter(Boolean);
  const toggle = (name: string) => {
    if (!multiple) return onChange(name);
    onChange(selected.includes(name) ? selected.filter((item) => item !== name).join(", ") : [...selected, name].join(", "));
  };
  return <div className="product-color-picker">
    <div className="product-color-swatches" role={multiple ? "group" : "radiogroup"} aria-label="Choose product color">
      {productColors.map(([name, hex]) => <button type="button" className={selected.includes(name) ? "selected" : ""} style={{ "--product-color": hex } as React.CSSProperties} aria-label={name} aria-pressed={selected.includes(name)} title={name} onClick={() => toggle(name)} key={name}><span /></button>)}
      <label className="product-custom-color" title="Custom color"><input type="color" aria-label="Choose custom color" value={selected.find((item) => /^#[0-9a-f]{6}$/i.test(item)) || "#6d3fc0"} onChange={(event) => onChange(multiple ? [...selected.filter((item) => !/^#[0-9a-f]{6}$/i.test(item)), event.target.value].join(", ") : event.target.value)} /><span>+</span></label>
    </div>
    <small>{selected.length ? selected.join(", ") : multiple ? "Select one or more colors" : "Select a color"}</small>
  </div>;
};

const loadProductDraft = (): typeof initialForm => {
  try {
    const saved = JSON.parse(localStorage.getItem(PRODUCT_DRAFT_KEY) || "null") as Partial<typeof initialForm> | null;
    if (!saved) return initialForm;
    return {
      ...initialForm,
      ...saved,
      shipping: { ...initialForm.shipping, ...saved.shipping },
      digitalProduct: { ...initialForm.digitalProduct, ...saved.digitalProduct },
      serviceDetails: { ...initialForm.serviceDetails, ...saved.serviceDetails },
      specifications: saved.specifications || {},
      images: saved.images || [],
      variants: saved.variants || [],
      sellerAgreementAccepted: false,
    };
  } catch {
    return initialForm;
  }
};

const AddProductPage = () => {
  const navigate = useNavigate();
  const { user, updateProfile, refreshPiSession } = useAuthContext();
  const [form, setForm] = useState(loadProductDraft);
  const [step, setStep] = useState(() => { try { return restoredProductStep(localStorage.getItem(PRODUCT_STEP_KEY)); } catch { return 0; } });
  const [issues, setIssues] = useState<ProductIssue[]>([]);
  const [draftError, setDraftError] = useState("");
  const [processingImages, setProcessingImages] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const published = useRef(false);
  const latest = useRef({ form, step });
  latest.current = { form, step };
  const saved = useRef("");
  const serializeDraft = (value: typeof initialForm) => JSON.stringify({ ...value, sellerAgreementAccepted: false });
  const saveDraft = () => {
    if (published.current) return true;
    try {
      const value = serializeDraft(latest.current.form);
      localStorage.setItem(PRODUCT_DRAFT_KEY, value);
      localStorage.setItem(PRODUCT_STEP_KEY, String(latest.current.step));
      saved.current = value;
      setDraftError("");
      return true;
    } catch {
      setDraftError("This device could not save your draft. Keep this page open; device storage may be full. Your entered data is still here.");
      return false;
    }
  };
  const hasListing = Boolean(form.title || form.description || form.images.length || form.pricePi || form.priceUsdt || form.variants.length);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [activatingSeller, setActivatingSeller] = useState(false);
  const [sellerActivatedHere, setSellerActivatedHere] = useState(false);
  const [profileLocationLocked, setProfileLocationLocked] = useState(true);
  const sellerActive = Boolean(sellerActivatedHere || user?.sellerActive || user?.role === "seller");
  const titleInsight = useMemo(() => {
    const title = form.title.toLowerCase();
    return titleSignals.find((signal) => signal.words.some((word) => title.includes(word)));
  }, [form.title]);
  const activeFields = titleInsight?.fields || categoryFields[form.category];
  const suggestedVariants = titleInsight?.variants || (["Fashion & Clothing", "Electronics"].includes(form.category) ? ["color", "size"] : []);
  const priceUsdt = Number(form.priceUsdt);
  const pricePi = Number(form.pricePi);
  const location = [form.country, form.stateRegion, form.city, form.areaAddress].map((item) => item.trim()).filter(Boolean).join(" - ");
  const publishDisabled = submitting || processingImages > 0 || !form.sellerAgreementAccepted;
  const blocker = useBlocker(() => !published.current && (submitting || processingImages > 0 || (hasListing && saved.current !== serializeDraft(latest.current.form))));

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      setSuccess("");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveDraft();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, step]);

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (!published.current && (submitting || processingImages > 0 || (hasListing && !saveDraft()))) { event.preventDefault(); event.returnValue = ""; }
    };
    const flush = () => { if (document.hidden && hasListing) saveDraft(); };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", flush);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("visibilitychange", flush); };
  }, [hasListing, processingImages, submitting]);

  const goToStep = (next: number) => {
    setStep(next);
    window.setTimeout(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, 0);
  };
  const showIssues = (next: ProductIssue[]) => {
    setIssues(next);
    if (!next.length) return false;
    goToStep(next[0].step);
    window.setTimeout(() => {
      const field = formRef.current?.querySelector<HTMLElement>(`[name="${next[0].field}"]`);
      const section = field?.closest("details");
      if (section) section.open = true;
      field?.focus();
    }, 0);
    return true;
  };
  const nextStep = () => {
    if (!showIssues(productIssues(form, sellerActive).filter(issue => issue.step === step))) goToStep(Math.min(3, step + 1));
  };
  const fieldProps = (field: string) => ({ name: field, id: "product-" + field, "aria-invalid": issues.some(issue => issue.field === field) || undefined, "aria-describedby": issues.some(issue => issue.field === field) ? "product-error-" + field : undefined });
  const fieldError = (field: string) => issues.find(issue => issue.field === field) ? <small className="product-field-error" id={"product-error-" + field}>{issues.find(issue => issue.field === field)!.message}</small> : null;

  useEffect(() => {
    if (!user || !profileLocationLocked) return;
    setForm((current) => ({
      ...current,
      country: current.country || user.country || "",
      sellerContact: current.sellerContact || user.contactPhone || user.piUsername || user.username || "",
    }));
  }, [profileLocationLocked, user]);

  const setProductTitle = (title: string) => {
    const cleanTitle = title.toLowerCase();
    const signal = titleSignals.find((item) => item.words.some((word) => cleanTitle.includes(word)));
    setForm((current) => ({
      ...current,
      title,
      category: signal?.category || current.category,
      digitalProduct: { ...current.digitalProduct, enabled: signal?.category === "Digital Products" ? true : current.digitalProduct.enabled },
      serviceDetails: { ...current.serviceDetails, enabled: signal?.category === "Services" ? true : current.serviceDetails.enabled },
    }));
  };

  const setCategory = (category: CategoryName) => {
    setForm((current) => ({
      ...current,
      category,
      digitalProduct: { ...current.digitalProduct, enabled: category === "Digital Products" },
      serviceDetails: { ...current.serviceDetails, enabled: category === "Services" },
    }));
  };

  const setUsdtPrice = (value: string) => {
    const amount = Number(value);
    setForm((current) => ({ ...current, priceUsdt: value, pricePi: Number.isFinite(amount) && amount > 0 ? trimAmount(piFromUsdt(amount), 8) : "" }));
  };

  const setPiPrice = (value: string) => {
    const amount = Number(value);
    setForm((current) => ({ ...current, pricePi: value, priceUsdt: Number.isFinite(amount) && amount > 0 ? trimAmount(usdtFromPi(amount), 2) : "" }));
  };

  const selectImages = (files?: FileList | null) => {
    setError("");
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const availableSlots = MAX_PRODUCT_IMAGES - form.images.length;
    if (availableSlots <= 0) return setError("You can add up to 12 product images.");
    if (selected.some((file) => !file.type.startsWith("image/") || file.size > MAX_SOURCE_IMAGE_BYTES)) return setError("Choose up to 12 images, each 10 MB or smaller. Large photos are compressed automatically.");
    setProcessingImages(current => current + 1);
    Promise.all(selected.slice(0, availableSlots).map(compressProductImage)).then((images) => setForm((current) => {
      const gallery = [...current.images, ...images].slice(0, MAX_PRODUCT_IMAGES);
      return { ...current, image: gallery[0] || "", images: gallery };
    })).catch(() => setError("Could not read the selected images.")).finally(() => setProcessingImages(current => current - 1));
  };

  const removeImage = (index: number) => {
    setForm((current) => {
      const images = current.images.filter((_, imageIndex) => imageIndex !== index);
      return { ...current, image: images[0] || "", images };
    });
  };

  const setSpec = (key: string, value: string) => setForm((current) => ({ ...current, specifications: { ...current.specifications, [key]: value } }));
  const renderSpecField = (field: string) => {
    const options = selectOptionsByField[field.toLowerCase()];
    return (
      <label key={field}>
        {field}
        {field.toLowerCase().includes("color") ? (
          <ColorPicker value={form.specifications[field] || ""} onChange={(value) => setSpec(field, value)} multiple />
        ) : options ? (
          <select value={form.specifications[field] || ""} onChange={(event) => setSpec(field, event.target.value)}>
            <option value="">Select {field.toLowerCase()}</option>
            {options.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
        ) : (
          <input value={form.specifications[field] || ""} onChange={(event) => setSpec(field, event.target.value)} />
        )}
      </label>
    );
  };
  const updateVariant = (index: number, patch: Partial<VariantRow>) => setForm((current) => ({ ...current, variants: current.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, ...patch } : variant) }));
  const addVariant = () => setForm((current) => ({ ...current, variants: [...current.variants, emptyVariant()].slice(0, 50) }));
  const removeVariant = (index: number) => setForm((current) => ({ ...current, variants: current.variants.filter((_, variantIndex) => variantIndex !== index) }));
  const selectVariantImage = (index: number, file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return setError("Choose a variant image that is 2 MB or smaller.");
    const reader = new FileReader();
    setProcessingImages(current => current + 1);
    reader.onload = () => updateVariant(index, { image: String(reader.result || "") });
    reader.onerror = () => setError("Could not read the selected variant image.");
    reader.onloadend = () => setProcessingImages(current => current - 1);
    reader.readAsDataURL(file);
  };


  const activateSeller = async () => {
    if (!user) return;
    setActivatingSeller(true);
    setError("");
    try {
      const updatedUser = await updateProfile({
        displayName: user.displayName || user.username || "Pi User",
        country: user.country || "",
        contactPhone: user.contactPhone || "",
        avatar: user.avatar || "",
        coverImage: user.coverImage || "",
        bio: user.bio || "",
        language: user.language || user.settings?.language || "English",
        sellerActive: true,
        role: user.role === "admin" ? "admin" : "seller",
      });
      setSellerActivatedHere(Boolean(updatedUser?.sellerActive || updatedUser?.role === "seller"));
      setSuccess("Seller tools activated. You can now submit real products for review.");
    } catch (err: unknown) {
      setError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || "Seller tools could not be activated. Try again." : "Seller tools could not be activated. Try again.");
    } finally {
      setActivatingSeller(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (step !== 3) return nextStep();
    if (processingImages) return setError("Please wait for the selected images to finish processing.");
    if (showIssues(productIssues(form, sellerActive))) return;
    const quantity = Number(form.quantity);
    setSubmitting(true);
    let uploadField: { field: string; step: number } | null = { field: "images", step: 1 };
    try {
      const uploadedImages = await uploadImages(form.images.length ? form.images : [form.image], "products");
      uploadField = { field: "variants", step: 2 };
      const uploadedVariants = await Promise.all(form.variants.map(async (variant) => {
        const variantUsdt = Number(variant.priceUsdt);
        return {
          ...Object.fromEntries(variantFields.map((field) => [field, variant[field].trim()])),
          stock: Number(variant.stock || 0),
          priceUsdt: Number.isFinite(variantUsdt) && variantUsdt > 0 ? variantUsdt : undefined,
          pricePi: Number.isFinite(variantUsdt) && variantUsdt > 0 ? piFromUsdt(variantUsdt) : undefined,
          image: variant.image ? await uploadImage(variant.image, "products") : "",
        };
      }));
      uploadField = null;
      const payload = {
        title: form.title.trim(),
        image: uploadedImages[0],
        images: uploadedImages,
        description: form.description.trim(),
        category: categoryToApiCategory(form.category),
        condition: form.condition,
        quantity,
        country: form.country.trim(),
        stateRegion: form.stateRegion.trim(),
        city: form.city.trim(),
        areaAddress: form.areaAddress.trim(),
        location,
        deliveryOption: form.deliveryOption,
        productStatus: form.productStatus,
        variants: uploadedVariants,
        specifications: form.specifications,
        attributes: {},
        shipping: form.shipping,
        warranty: form.warranty,
        returnPolicy: form.returnPolicy,
        seo: { slug: "", metaTitle: "", metaDescription: "" },
        digitalProduct: { ...form.digitalProduct, downloadLimit: Number(form.digitalProduct.downloadLimit || form.specifications["Download Limit"] || 0) },
        serviceDetails: form.serviceDetails,
        sellerContact: form.sellerContact.trim(),
        pricePi,
        priceUsdt,
        sellerAgreementAccepted: form.sellerAgreementAccepted,
      };
      const postProduct = () => axiosClient.post<{ product: Product }>("/marketplace/products", payload);
      let response;
      try {
        response = await postProduct();
      } catch (err: unknown) {
        if (isAxiosError<{ message?: string }>(err) && err.response?.status === 401 && await refreshPiSession()) {
          response = await postProduct();
        } else {
          throw err;
        }
      }
      const { data } = response;
      published.current = true;
      setSuccess(data.product.reviewStatus === "approved" ? "Product saved and is live in SMAJ Store." : "Product submitted for pending review.");
      try {
        localStorage.removeItem(PRODUCT_DRAFT_KEY);
        localStorage.removeItem(PRODUCT_STEP_KEY);
      } catch { /* The server has confirmed publication; device storage cannot undo it. */ }
      window.setTimeout(() => navigate("/seller"), 900);
    } catch (err: unknown) {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || "Could not add product." : err instanceof Error ? err.message : "Could not add product.";
      if (uploadField) { setError(""); showIssues([{ ...uploadField, message }]); }
      else setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="add-product-page product-wizard">
      <header className="product-wizard-header">
        <div><p className="private-kicker">SELLER TOOLS</p><h1>Add Product</h1><p>Create a listing in SMAJ Store</p></div>
        <span className="product-step-count" aria-live="polite">Step {step + 1} of 4</span>
      </header>
      <ol className="product-wizard-progress" aria-label="Listing progress">
        {productSteps.map((title, index) => <li key={title} className={index <= step ? "reached" : ""}><span aria-current={index === step ? "step" : undefined} aria-label={`Step ${index + 1}: ${title}`} /></li>)}
      </ol>
      <h2 className="product-wizard-step-title" ref={headingRef} tabIndex={-1}>{productSteps[step]}</h2>
      {!sellerActive ? (
        <section className="private-form seller-activation-panel">
          <div><p className="private-kicker">SELLER ACCESS REQUIRED</p><h2>Activate seller tools first</h2><p>Listing is available for seller accounts connected to your Pi identity.</p></div>
          <button {...fieldProps("sellerActive")} className="private-primary-button" type="button" disabled={activatingSeller} onClick={() => void activateSeller()}>{activatingSeller ? "Activating..." : "Activate Seller Tools"}</button>
          {fieldError("sellerActive")}
        </section>
      ) : null}
      <form ref={formRef} className="private-form product-form-accordions smart-product-form" aria-label={productSteps[step]} noValidate onChangeCapture={(event) => { const field = (event.target as HTMLElement).getAttribute("name"); if (field) setIssues(current => current.filter(issue => issue.field !== field)); }} onSubmit={(event) => void submit(event)}>
        <details className="product-accordion" data-product-step="0" hidden={step !== 0} open>
          <summary><span><strong>Product Search / Name</strong><small>Type the product name to suggest the best category and fields.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <label>Product name<input {...fieldProps("title")} required maxLength={120} value={form.title} onChange={(event) => setProductTitle(event.target.value)} placeholder="Example: Nike running shoes size 42" />{fieldError("title")}</label>
          <div className={`product-name-guide ${titleInsight ? "good" : "weak"}`}>
            <div><strong>{titleInsight ? `${titleInsight.category} detected` : "Add a clear product name"}</strong><p>{titleInsight ? "Only relevant details are shown below." : "Use brand, model, size, storage, or type so buyers can find it quickly."}</p></div>
            <div className="product-name-guide-chips">{activeFields.slice(0, 3).map((field) => <span key={field}>{field}</span>)}</div>
          </div>
          <label>Category<select required value={form.category} onChange={(event) => setCategory(event.target.value as CategoryName)}>{categoryNames.map((item) => <option key={item}>{item}</option>)}</select></label>
        </details>

        <details className="product-accordion" data-product-step="1" hidden={step !== 1} open>
          <summary><span><strong>Photos</strong><small>Add up to 12 clear images. First image is the main image.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <label>Product gallery ({form.images.length}/12 images)<input {...fieldProps("images")} multiple type="file" accept="image/*" onChange={(event) => { selectImages(event.target.files); event.currentTarget.value = ""; }} />{fieldError("images")}</label>
          {form.images.length ? <div className="product-gallery-preview">{form.images.map((image, index) => <figure key={`${image.slice(-30)}-${index}`}><img src={image} alt={`Product preview ${index + 1}`} />{index === 0 ? <span>Main</span> : null}<button type="button" onClick={() => removeImage(index)}>Remove</button></figure>)}</div> : null}
        </details>

        <details className="product-accordion" data-product-step="0" hidden={step !== 0} open>
          <summary><span><strong>Basic Details</strong><small>Required basics kept short.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <div className="private-form-row">
            <label>Condition<select {...fieldProps("condition")} required value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}>{["New", "Like New", "Used", "Refurbished"].map((item) => <option key={item}>{item}</option>)}</select>{fieldError("condition")}</label>
            <label>Quantity<input {...fieldProps("quantity")} required type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />{fieldError("quantity")}</label>
          </div>
          <label>Description<textarea {...fieldProps("description")} required minLength={20} maxLength={1500} rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the real condition, what is included, and important buyer details." /><small className="form-help">{form.description.length}/1500 characters</small>{fieldError("description")}</label>
        </details>

        <details className="product-accordion" data-product-step="1" hidden={step !== 1} open>
          <summary><span><strong>Price in USDT + PI</strong><small>{formatPiRate()}. Edit either field.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <div className="private-form-row">
            <label>$ price (USDT)<input {...fieldProps("priceUsdt")} required type="number" min="0.01" step="any" value={form.priceUsdt} onChange={(event) => setUsdtPrice(event.target.value)} />{fieldError("priceUsdt")}</label>
            <label>π price<input {...fieldProps("pricePi")} required type="number" min="0.00000001" step="any" value={form.pricePi} onChange={(event) => setPiPrice(event.target.value)} />{fieldError("pricePi")}</label>
          </div>
          {priceUsdt > 0 && pricePi > 0 ? <small className="product-price-preview">Listing price: {formatUsdAmount(priceUsdt)} USDT · {formatPiAmount(pricePi)}</small> : null}
        </details>

        <details className="product-accordion" data-product-step="2" hidden={step !== 2} open>
          <summary><span><strong>Category-Specific Details</strong><small>Only details for {form.category}.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <div className="private-form-row">{activeFields.map((field) => renderSpecField(field))}</div>
        </details>

        <details className="product-accordion" data-product-step="2" hidden={step !== 2}>
          <summary><span><strong>Variants</strong><small>Advanced options for size, color, storage, RAM, or model.</small></span><span className="section-tag">Advanced</span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          {suggestedVariants.length ? <div className="product-name-guide good"><p>Suggested variant fields: {suggestedVariants.join(", ")}.</p></div> : null}
          <button {...fieldProps("variants")} type="button" className="private-secondary-button" onClick={addVariant}>Add Variant</button>
          {fieldError("variants")}
          {form.variants.length ? <div className="product-variant-list">{form.variants.map((variant, index) => <article key={index}><div className="product-variant-head"><strong>Variant {index + 1}</strong><button type="button" onClick={() => removeVariant(index)}>Remove</button></div><div className="private-form-row">{variantFields.map((field) => {
            const options = selectOptionsByField[field];
            return <label key={field}>{field}{field === "color" ? <ColorPicker value={variant.color} onChange={(value) => updateVariant(index, { color: value })} /> : options ? <select value={variant[field]} onChange={(event) => updateVariant(index, { [field]: event.target.value } as Partial<VariantRow>)}><option value="">Select {field}</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input value={variant[field]} onChange={(event) => updateVariant(index, { [field]: event.target.value } as Partial<VariantRow>)} />}</label>;
          })}</div><div className="private-form-row"><label>Variant stock<input type="number" min="0" value={variant.stock} onChange={(event) => updateVariant(index, { stock: event.target.value })} /></label><label>Variant $ price (USDT)<input type="number" min="0" step="any" value={variant.priceUsdt} onChange={(event) => updateVariant(index, { priceUsdt: event.target.value })} /></label><label>Variant image<input type="file" accept="image/*" onChange={(event) => { selectVariantImage(index, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>{variant.image ? <img className="product-variant-image" src={variant.image} alt="" /> : null}</article>)}</div> : <div className="private-state compact"><h3>No variants yet</h3><p>Add only if the item has choices like sizes, colors, storage, or models.</p></div>}
        </details>

        <details className="product-accordion" data-product-step="2" hidden={step !== 2} open>
          <summary><span><strong>Delivery / Service Method</strong><small>Choose delivery, pickup, digital delivery, or appointment method.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <div className="private-form-row">
            <label>Delivery method<select {...fieldProps("deliveryOption")} required value={form.deliveryOption} onChange={(event) => setForm({ ...form, deliveryOption: event.target.value })}>{(form.category === "Services" ? ["Online Service", "In-person Service", "Online or In-person"] : form.category === "Digital Products" ? ["Digital Delivery"] : ["Delivery", "Pickup", "Delivery or Pickup"]).map((item) => <option key={item}>{item}</option>)}</select>{fieldError("deliveryOption")}</label>
            <label>Delivery time<input value={form.shipping.deliveryTime} onChange={(event) => setForm({ ...form, shipping: { ...form.shipping, deliveryTime: event.target.value } })} placeholder={form.category === "Services" ? "Available weekdays" : "2-4 days"} /></label>
          </div>
          {form.category !== "Digital Products" && form.category !== "Services" ? <div className="private-form-row"><label>Weight<input value={form.shipping.weight} onChange={(event) => setForm({ ...form, shipping: { ...form.shipping, weight: event.target.value } })} placeholder="1.2 kg" /></label><label>Dimensions<input value={form.shipping.dimensions} onChange={(event) => setForm({ ...form, shipping: { ...form.shipping, dimensions: event.target.value } })} placeholder="30 x 20 x 10 cm" /></label></div> : null}
          {form.category === "Services" ? <div className="private-form-row"><label>Duration<input value={form.serviceDetails.duration} onChange={(event) => setForm({ ...form, serviceDetails: { ...form.serviceDetails, duration: event.target.value, enabled: true } })} placeholder="60 minutes" /></label><label>Location type<select value={form.serviceDetails.locationType} onChange={(event) => setForm({ ...form, serviceDetails: { ...form.serviceDetails, locationType: event.target.value, enabled: true } })}><option>Online</option><option>Offline</option><option>Online / Offline</option></select></label></div> : null}
          {form.category === "Digital Products" ? <div className="private-form-row"><label>File URL<input value={form.digitalProduct.fileUrl} onChange={(event) => setForm({ ...form, digitalProduct: { ...form.digitalProduct, fileUrl: event.target.value, enabled: true } })} /></label><label>License key<input value={form.digitalProduct.licenseKey} onChange={(event) => setForm({ ...form, digitalProduct: { ...form.digitalProduct, licenseKey: event.target.value, enabled: true } })} /></label></div> : null}
        </details>

        <details className="product-accordion" data-product-step="2" hidden={step !== 2}>
          <summary><span><strong>Warranty / Returns</strong><small>Advanced buyer expectations.</small></span><span className="section-tag">Advanced</span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <div className="private-form-row"><label>Warranty<select value={form.warranty} onChange={(event) => setForm({ ...form, warranty: event.target.value })}>{["No Warranty", "7 Days", "30 Days", "6 Months", "1 Year"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Return Policy<select value={form.returnPolicy} onChange={(event) => setForm({ ...form, returnPolicy: event.target.value })}>{["No Returns", "7 Days", "14 Days", "30 Days"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
        </details>

        <details className="product-accordion" data-product-step="3" hidden={step !== 3} open>
          <summary><span><strong>Review & Publish</strong><small>Status is pending review by default.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <div className="product-wizard-review">
            {form.image ? <img src={form.image} alt="Main product preview" /> : null}
            <div><strong>{form.title || "Product name required"}</strong><p>{form.category} · {form.condition} · Quantity {form.quantity}</p><p>{formatUsdAmount(priceUsdt)} USDT · {formatPiAmount(pricePi)}</p></div>
            <button type="button" className="private-secondary-button" onClick={() => goToStep(0)}>Edit information</button>
            <button type="button" className="private-secondary-button" onClick={() => goToStep(1)}>Edit photos & pricing</button>
            <button type="button" className="private-secondary-button" onClick={() => goToStep(2)}>Edit options</button>
          </div>
          <div className="product-name-guide good"><p>Publishing status: Pending review. Admin will review before this appears live unless your seller account is auto-approved.</p></div>
          <div className="product-location-card">
            <div><strong>Using your profile location</strong><p>{[form.country, form.stateRegion, form.city].filter(Boolean).join(" - ") || "Add location details before publishing."}</p></div>
            <button type="button" className="private-secondary-button" onClick={() => setProfileLocationLocked(false)}>Edit</button>
          </div>
          <LocationFields errors={Object.fromEntries(issues.filter(issue => ["country", "city", "areaAddress"].includes(issue.field)).map(issue => [issue.field, issue.message]))} idPrefix="product-" value={form} countryDisabled={profileLocationLocked && Boolean(form.country)} onChange={(location) => setForm({ ...form, ...location })} />
          <label>Seller contact<input {...fieldProps("sellerContact")} required value={form.sellerContact} onChange={(event) => setForm({ ...form, sellerContact: event.target.value })} placeholder="+971 50 123 4567, email, or Pi username" />{fieldError("sellerContact")}</label>
        </details>

        <details className="product-accordion" data-product-step="3" hidden={step !== 3} open>
          <summary><span><strong>Seller Agreement</strong><small>Required before publish.</small></span><span className="accordion-chevron" aria-hidden="true">▾</span></summary>
          <label className="setting-line"><span><strong>Seller agreement</strong><small>Read the official <Link className="seller-agreement-link" to="/seller-agreement" target="_blank" rel="noreferrer">SMAJ PI HUB Seller Agreement</Link> before accepting. I confirm this product is real, photos are clear, pricing is fair, location is valid, and SMAJ PI HUB may review before publishing.</small></span><input {...fieldProps("sellerAgreementAccepted")} type="checkbox" checked={form.sellerAgreementAccepted} onChange={(event) => setForm({ ...form, sellerAgreementAccepted: event.target.checked })} />{fieldError("sellerAgreementAccepted")}</label>
        </details>

        {issues.length ? <div className="product-wizard-errors" role="alert"><strong>Please check these fields:</strong><ul>{issues.map(issue => <li key={issue.field}><button type="button" onClick={() => showIssues([issue])}>{issue.message}</button></li>)}</ul></div> : null}
        {error ? <div className="private-alert error" role="alert">{error}</div> : null}
        {draftError ? <div className="private-alert error" role="alert">{draftError}</div> : null}
        {success ? <div className="private-alert success" role="status">{success}</div> : null}
        {processingImages > 0 ? <p role="status">Processing selected images...</p> : null}
        <div className="product-wizard-actions" aria-label="Listing form actions">
          <button type="button" className="private-secondary-button" disabled={submitting || processingImages > 0} onClick={() => { if (saveDraft()) setSuccess("Draft saved on this device."); }}>Save draft</button>
          {step > 0 ? <button type="button" className="private-secondary-button" disabled={submitting} onClick={() => goToStep(step - 1)}>Back</button> : null}
          {step < 3 ? <button key="next-step" type="button" className="private-primary-button" disabled={submitting || processingImages > 0} onClick={nextStep}>Next <span aria-hidden="true">{String.fromCharCode(8594)}</span></button> : <button key="publish-product" type="submit" className="private-primary-button" disabled={publishDisabled}>{submitting ? "Publishing..." : "Publish for Review"}</button>}
        </div>
        {step === 3 && !form.sellerAgreementAccepted ? <p className="form-help">Accept the seller agreement to enable Publish for Review.</p> : null}
      </form>
      {blocker.state === "blocked" ? <div className="product-leave-backdrop"><section className="product-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="product-leave-title" onKeyDown={(event) => { if (event.key === "Escape") blocker.reset(); if (event.key === "Tab") { const buttons = event.currentTarget.querySelectorAll("button"); const target = event.shiftKey ? buttons[0] : buttons[buttons.length - 1]; if (document.activeElement === target) { event.preventDefault(); (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus(); } } }}><h2 id="product-leave-title">Keep your listing?</h2><p>Your latest changes or selected images have not finished saving.</p><button type="button" className="private-primary-button" autoFocus onClick={() => { saveDraft(); blocker.reset(); }}>Stay and save draft</button><button type="button" className="private-secondary-button" onClick={() => blocker.proceed()}>Leave without saving latest changes</button></section></div> : null}
    </main>
  );
};

export default AddProductPage;
