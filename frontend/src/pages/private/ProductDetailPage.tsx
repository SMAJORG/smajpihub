import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import StarHalfRoundedIcon from "@mui/icons-material/StarHalfRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { isAxiosError } from "axios";
import MarketplaceProductCard from "../../components/MarketplaceProductCard";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import TrustBadge from "../../components/TrustBadge";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import { countryDisplayName, countryFlag, formatPiAmount, formatUsdAmount } from "../../lib/formatters";
import { PI_USDT_RATE, piFromUsdt } from "../../lib/piPricing";
import { setBuyNowItem } from "../../lib/storeCart";
import { useAddToCartToast } from "../../hooks/useAddToCartToast";
import type { Product, SellerSummary } from "../../types/marketplace";

const supportEmail = "info@smajpihub.com";

const ProductDetailPage = () => {
  const { id } = useParams();
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [seller, setSeller] = useState<SellerSummary | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [saved, setSaved] = useState(false);
  const [selectedImage, setSelectedImage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Misleading or inappropriate listing");
  const { addProductToCart, cartToast } = useAddToCartToast();
  const galleryTouchStart = useRef<number | null>(null);

  useEffect(() => {
    if (!imageViewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImageViewerOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageViewerOpen]);

  useEffect(() => {
    axiosClient
      .get(`/marketplace/products/${id}`)
      .then(({ data }) => {
        setProduct(data.product);
        setSeller(data.seller);
        setRelated(data.related || []);
        setSaved(Boolean(data.saved));
        setSelectedImage(data.product.images?.[0] || data.product.image);
        window.localStorage.setItem("smaj_last_viewed_product", data.product._id);
        try {
          const current = JSON.parse(window.localStorage.getItem("smaj_recent_products") || "[]");
          const items = Array.isArray(current) ? current : [];
          const next = [{ label: data.product.title, to: `/product/${data.product._id}`, meta: data.product.category || "Product" }, ...items.filter((item) => item?.to !== `/product/${data.product._id}`)].slice(0, 8);
          window.localStorage.setItem("smaj_recent_products", JSON.stringify(next));
        } catch {
          window.localStorage.removeItem("smaj_recent_products");
        }
      })
      .catch(() => {
        setError("Product not found.");
      });
  }, [id]);

  const action = async (kind: "order" | "report" | "message" | "favorite") => {
    if (!product) return;

    setSubmitting(true);
    setError("");

    try {
      if (kind === "order") {
        setBuyNowItem(product);
        navigate("/checkout");
      } else if (kind === "favorite") {
        const { data } = await axiosClient.post(`/marketplace/products/${product._id}/favorite`);
        setSaved(data.saved);
      } else if (kind === "message") {
        const { data } = await axiosClient.post("/messages/start", { productId: product._id });
        navigate(`/messages?conversation=${data.conversation._id}`);
      }
    } catch (err: unknown) {
      setError(
        isAxiosError<{ message?: string }>(err)
          ? err.response?.data?.message || "Action could not be completed."
          : "Action could not be completed."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitReport = async () => {
    if (!product || !reportReason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await axiosClient.post(`/marketplace/products/${product._id}/report`, { reason: reportReason.trim() });
      setMessage("Product report submitted for team review.");
      setReportOpen(false);
      setReportReason("Misleading or inappropriate listing");
    } catch (err: unknown) {
      setError(
        isAxiosError<{ message?: string }>(err)
          ? err.response?.data?.message || "Report could not be submitted."
          : "Report could not be submitted."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!product) {
    return (
      <main className="private-page">
        {error ? <div className="private-state">{error}</div> : <PrivateSkeleton variant="product" />}
      </main>
    );
  }

  const images = product.images?.length ? product.images : [product.image].filter(Boolean);
  const sellerAvatar = seller?.avatar || product.sellerAvatar || "";
  const sellerName = seller?.displayName || product.sellerName;
  const sellerCountry = countryDisplayName(seller?.country || product.country || product.location.split(" - ")[0]);
  const sellerFlag = countryFlag(seller?.country || product.country || product.location.split(" - ")[0]);
  const sellerLocation = [sellerCountry, product.stateRegion, product.city, product.areaAddress].filter(Boolean).join(" - ") || product.location;
  const piPrice = product.pricePi > 0 ? product.pricePi : piFromUsdt(product.priceUsdt || 0);
  const selectedImageIndex = Math.max(0, images.indexOf(selectedImage));
  const visibleThumbnails = images.slice(0, 4);
  const productReviewCount = product.reviewCount || 0;
  const productRating = productReviewCount > 0 ? Math.max(0, Math.min(5, product.rating || 0)) : 0;
  const selectAdjacentImage = (direction: number) => {
    if (images.length < 2) return;
    const nextIndex = (selectedImageIndex + direction + images.length) % images.length;
    setSelectedImage(images[nextIndex]);
  };

  return (
    <main className="private-page product-detail-page">
      {cartToast}

      <section className="product-detail">
        <div className="product-gallery">
          <div
            className="product-detail-image"
            role={selectedImage ? "button" : undefined}
            tabIndex={selectedImage ? 0 : undefined}
            aria-label={selectedImage ? "Open full screen product image" : undefined}
            onClick={() => { if (selectedImage) setImageViewerOpen(true); }}
            onKeyDown={(event) => {
              if (selectedImage && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setImageViewerOpen(true);
              }
            }}
            onTouchStart={(event) => { galleryTouchStart.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
              if (galleryTouchStart.current === null) return;
              const distance = event.changedTouches[0]?.clientX - galleryTouchStart.current;
              if (Math.abs(distance) > 45) selectAdjacentImage(distance < 0 ? 1 : -1);
              galleryTouchStart.current = null;
            }}
          >
            {selectedImage ? <img src={selectedImage} alt={product.title} /> : <span>No image supplied</span>}
            {images.length ? <span className="product-gallery-count">{selectedImageIndex + 1} / {images.length}</span> : null}
          </div>
          {images.length > 1 ? (
            <div className="gallery-thumbnails">
              {visibleThumbnails.map((image) => (
                <button
                  className={selectedImage === image ? "active" : ""}
                  key={image.slice(-30)}
                  onClick={() => setSelectedImage(image)}
                >
                  <img src={image} alt="" />
                </button>
              ))}
              {images.length > visibleThumbnails.length ? <span className="gallery-more">+{images.length - visibleThumbnails.length}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="product-detail-content">
          <span className="product-category inline">{product.category}</span>
          <h1>{product.title}</h1>
          <div className="product-detail-rating"><span>{Array.from({ length: 5 }).map((_, index) => productRating >= index + 1 ? <StarRoundedIcon className="star-filled" key={index} /> : productRating >= index + 0.5 ? <StarHalfRoundedIcon className="star-half" key={index} /> : <StarBorderRoundedIcon className="star-empty" key={index} />)}</span><small>{productReviewCount ? `${productRating.toFixed(1)} (${productReviewCount} reviews)` : "No reviews yet"}</small></div>
          <div className="product-detail-price-row"><strong>{formatUsdAmount(product.priceUsdt ?? product.pricePi * PI_USDT_RATE)}</strong><small>{formatPiAmount(piPrice)}</small></div>
          <p className="product-delivery-line">{sellerFlag ? `${sellerFlag} ` : ""}{product.city || sellerCountry} · {product.shipping?.deliveryTime || "Contact seller for delivery"}</p>

          <Link className="seller-info-card" to={`/seller/${product.sellerId}`}>
            <div className="profile-avatar small">
              {sellerAvatar ? <img src={sellerAvatar} alt={sellerName} /> : <span>{sellerName.slice(0, 1)}</span>}
            </div>
            <div className="seller-info-copy">
              <span className="seller-role-label">Seller</span>
              <strong className="seller-name-line">
                <span className="seller-name-text">{sellerName}</span>
                <TrustBadge level={seller?.verificationLevel || product.verificationLevel} status={seller?.verificationStatus || product.verificationStatus} />
              </strong>
              <p>
                @{seller?.piUsername || product.piUsername} · {sellerFlag ? `${sellerFlag} ` : ""}{sellerLocation}
              </p>
            </div>
          </Link>

          <details className="product-info-disclosure" open>
            <summary>Description</summary>
            <p>{product.description}</p>
          </details>
          <details className="product-info-disclosure">
            <summary>Product details</summary>
            <dl><div><dt>Condition</dt><dd>{product.condition || "New"}</dd></div><div><dt>Category</dt><dd>{product.category}</dd></div><div><dt>Location</dt><dd>{sellerLocation}</dd></div></dl>
          </details>

          {message ? <div className="private-alert success">{message}</div> : null}
          {error ? <div className="private-alert error">{error}</div> : null}

          {product.sellerId === user?.uid ? (
            <p className="private-alert">This is your listing.</p>
          ) : (
            <div className="product-detail-actions">
              <button className="private-primary-button" onClick={() => void action("order")} disabled={submitting}>
                Buy / Create Order
              </button>
              <button className="private-secondary-button" onClick={() => void action("message")}>
                <ChatOutlinedIcon /> Message Seller
              </button>
              <button className="private-secondary-button" onClick={() => void action("favorite")}>
                {saved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                {saved ? "Saved" : "Save"}
              </button>
              <button className="private-secondary-button" onClick={() => setReportOpen(true)}>
                <FlagOutlinedIcon /> Report
              </button>
            </div>
          )}
        </div>
      </section>

      {product.sellerId !== user?.uid ? (
        <aside className="product-mobile-purchase" aria-label="Purchase actions">
          <span><small>Price</small><strong>{formatUsdAmount(product.priceUsdt ?? product.pricePi * PI_USDT_RATE)}</strong><small>{formatPiAmount(piPrice)}</small></span>
          <button type="button" className="mobile-add-cart" onClick={() => addProductToCart(product)}>Add to Cart</button>
          <button type="button" className="mobile-buy-now" disabled={submitting} onClick={() => void action("order")}>Buy Now</button>
        </aside>
      ) : null}

      {imageViewerOpen && selectedImage ? createPortal((
        <div className="product-image-viewer" role="dialog" aria-modal="true" aria-label="Full screen product gallery" onClick={(event) => { if (event.target === event.currentTarget) setImageViewerOpen(false); }}>
          <button type="button" className="product-image-viewer-close" onClick={() => setImageViewerOpen(false)} aria-label="Close full screen image"><CloseOutlinedIcon /></button>
          {images.length > 1 ? <button type="button" className="product-image-viewer-arrow previous" onClick={() => selectAdjacentImage(-1)} aria-label="Previous product image"><ChevronLeftRoundedIcon /></button> : null}
          <img src={selectedImage} alt={`${product.title} ${selectedImageIndex + 1} of ${images.length}`} onTouchStart={(event) => { galleryTouchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (galleryTouchStart.current === null) return; const distance = event.changedTouches[0]?.clientX - galleryTouchStart.current; if (Math.abs(distance) > 45) selectAdjacentImage(distance < 0 ? 1 : -1); galleryTouchStart.current = null; }} />
          {images.length > 1 ? <button type="button" className="product-image-viewer-arrow next" onClick={() => selectAdjacentImage(1)} aria-label="Next product image"><ChevronRightRoundedIcon /></button> : null}
          {images.length > 1 ? <div className="product-image-viewer-thumbnails" aria-label="Product images">{images.map((image, index) => <button type="button" className={image === selectedImage ? "active" : ""} onClick={() => setSelectedImage(image)} aria-label={`Show image ${index + 1}`} key={`${image.slice(-30)}-${index}`}><img src={image} alt="" /></button>)}</div> : null}
        </div>
      ), document.body) : null}

      {related.length ? (
        <>
          <section className="section-title related-products-title">
            <div>
              <h2>Related products</h2>
              <p>Similar {product.category} you may like</p>
            </div>
            <Link to={`/store?category=${encodeURIComponent(product.category)}`}>See all</Link>
          </section>
          <section className="related-products-rail" aria-label="Related products">
            {related.map((item) => (
              <MarketplaceProductCard product={item} key={item._id} variant="compact" onAddToCart={addProductToCart} />
            ))}
          </section>
        </>
      ) : null}
      {reportOpen ? (
        <div className="service-modal-backdrop" onMouseDown={() => setReportOpen(false)}>
          <form className="service-modal marketplace-action-modal" onSubmit={(event) => { event.preventDefault(); void submitReport(); }} onMouseDown={(event) => event.stopPropagation()}>
            <h2>Report Product</h2>
            <p>Tell the SMAJ PI HUB team what looks unsafe, misleading, or abusive.</p>
            <label>
              Reason
              <textarea rows={5} maxLength={300} value={reportReason} onChange={(event) => setReportReason(event.target.value)} required />
            </label>
            <p>
              You can also email a detailed report to <a href="mailto:smajpihub@gmail.com">{supportEmail}</a>.
            </p>
            <div className="confirm-modal-actions">
              <button type="button" className="modal-cancel-button" onClick={() => setReportOpen(false)}>Cancel</button>
              <button type="submit" className="modal-signout-button" disabled={submitting}>{submitting ? "Submitting..." : "Submit Report"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
};

export default ProductDetailPage;
