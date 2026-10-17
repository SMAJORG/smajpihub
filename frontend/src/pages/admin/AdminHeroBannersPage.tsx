import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { axiosClient } from "../../lib/axiosClient";
import { uploadImage } from "../../lib/uploadImage";
import type { HeroBanner } from "../../lib/heroBanners";

const emptyForm = { placement: "dashboard" as HeroBanner["placement"], image: "", title: "", subtitle: "", search: "", textColor: "#ffffff", active: true, order: 0 };

const AdminHeroBannersPage = () => {
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await axiosClient.get<{ banners: HeroBanner[] }>("/admin/hero-banners");
      setBanners(data.banners);
    } catch (reason: unknown) {
      const status = isAxiosError(reason) ? reason.response?.status : 0;
      setError(status === 404
        ? "Hero Manager API is not deployed on the backend yet. Deploy the latest backend, then retry."
        : status === 401
          ? "Your admin session expired. Sign in again, then retry."
          : status === 403
            ? "This account does not have backend admin permission."
            : status === 503
              ? "Hero banner storage is starting. Wait a moment, then retry."
              : "Could not reach the Hero Manager API. Check the backend and retry.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return setError("Choose a JPG, PNG, or WebP image up to 5 MB.");
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, image: String(reader.result || "") }));
    reader.onerror = () => setError("Could not read the selected image.");
    reader.readAsDataURL(file);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.image) return setError("Choose a hero image.");
    setSaving(true); setError(""); setMessage("");
    try {
      const image = await uploadImage(form.image, `hero-${form.placement}`);
      const payload = { ...form, image };
      if (editingId) await axiosClient.patch(`/admin/hero-banners/${editingId}`, payload);
      else await axiosClient.post("/admin/hero-banners", payload);
      setMessage(editingId ? "Banner updated." : "Banner created.");
      setForm(emptyForm); setEditingId("");
      await load();
    } catch (reason: any) {
      setError(reason?.response?.data?.message || reason?.message || "Could not save banner.");
    } finally { setSaving(false); }
  };

  const edit = (banner: HeroBanner) => {
    setEditingId(banner._id);
    setForm({ placement: banner.placement, image: banner.image, title: banner.title || "", subtitle: banner.subtitle || "", search: banner.search || "", textColor: banner.textColor || "#ffffff", active: banner.active, order: banner.order || 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (banner: HeroBanner) => {
    if (!window.confirm(`Delete ${banner.title || "this banner"}?`)) return;
    setBusyId(banner._id); setError(""); setMessage("");
    try {
      await axiosClient.delete(`/admin/hero-banners/${banner._id}`);
      if (editingId === banner._id) { setEditingId(""); setForm(emptyForm); }
      setMessage("Banner deleted.");
      await load();
    } catch (reason: any) { setError(reason?.response?.data?.message || "Could not delete banner. Please retry."); }
    finally { setBusyId(""); }
  };

  const toggle = async (banner: HeroBanner) => {
    setBusyId(banner._id); setError(""); setMessage("");
    try {
      await axiosClient.patch(`/admin/hero-banners/${banner._id}`, { active: !banner.active });
      setMessage(banner.active ? "Banner hidden." : "Banner shown.");
      await load();
    } catch (reason: any) { setError(reason?.response?.data?.message || "Could not change banner visibility. Please retry."); }
    finally { setBusyId(""); }
  };

  const importExisting = async () => {
    setImporting(true); setError(""); setMessage("");
    try {
      const { data } = await axiosClient.post<{ message: string; banners: HeroBanner[] }>("/admin/hero-banners/import-defaults");
      setBanners(data.banners);
      setMessage(data.message);
    } catch (reason: any) {
      setError(reason?.response?.data?.message || "Could not import the existing banners.");
    } finally { setImporting(false); }
  };

  return <main className="private-page admin-hero-page">
    <section className="private-page-head"><div><p className="private-kicker">ADMIN PANEL</p><h1>Dashboard &amp; Store Banners</h1><p>Add banners, replace images, edit or clear text, change colors and order, or hide and delete banners.</p></div><button type="button" className="private-secondary-button" disabled={importing} onClick={() => void importExisting()}>{importing ? "Importing..." : "Import existing banners"}</button></section>
    {message ? <div className="private-alert success">{message}</div> : null}
    {error ? <div className="private-alert error admin-hero-load-error"><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div> : null}
    <form className="admin-hero-form" onSubmit={submit}>
      <div className="admin-hero-preview">{form.image ? <img src={form.image} alt="Banner preview" /> : <span>Choose an image to preview it</span>}</div>
      <div className="admin-hero-fields">
        <label>Location<select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value as HeroBanner["placement"] })}><option value="dashboard">Dashboard</option><option value="store">Store</option></select></label>
        <label>Image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /></label>
        <label>Title<input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Banner title" /></label>
        <label>Description<textarea value={form.subtitle} maxLength={300} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Short banner description" /></label>
        <label>Store search keyword<input value={form.search} maxLength={120} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="Example: Electronics" /></label>
        <label>Text color<div className="admin-hero-color"><input type="color" value={form.textColor} onChange={(e) => setForm({ ...form, textColor: e.target.value })} /><input value={form.textColor} pattern="^#[0-9a-fA-F]{6}$" onChange={(e) => setForm({ ...form, textColor: e.target.value })} aria-label="Hero text color value" /></div></label>
        <label>Display order<input type="number" min="0" max="999" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} /></label>
        <label className="admin-hero-check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        <div className="admin-hero-actions"><button className="private-primary-button" disabled={saving}>{saving ? "Saving..." : editingId ? "Update banner" : "Add banner"}</button>{editingId ? <button type="button" className="private-secondary-button" onClick={() => { setEditingId(""); setForm(emptyForm); }}>Cancel</button> : null}</div>
      </div>
    </form>
    <section className="admin-hero-list">
      {banners.map((banner) => <article key={banner._id}><img src={banner.image} alt={banner.title || `${banner.placement} banner`} /><div><span>{banner.placement} · order {banner.order}{banner.sourceKey ? " · built-in" : ""}</span><h2>{banner.title || "Untitled banner"}</h2><p>{banner.subtitle || "No description"}</p><strong className={banner.active ? "active" : "inactive"}>{banner.active ? "Active" : "Hidden"}</strong></div><div><button disabled={Boolean(busyId) || saving} onClick={() => edit(banner)}>Edit</button><button disabled={Boolean(busyId) || saving} onClick={() => void toggle(banner)}>{banner.active ? "Hide" : "Show"}</button><button className="danger" disabled={Boolean(busyId) || saving} onClick={() => void remove(banner)}>Delete</button></div></article>)}
      {!banners.length ? <div className="private-state"><h2>No managed banners yet</h2><p>Add a banner above, or import the built-in banners to edit them. Hidden and deleted banners stay off the page.</p></div> : null}
    </section>
  </main>;
};

export default AdminHeroBannersPage;
