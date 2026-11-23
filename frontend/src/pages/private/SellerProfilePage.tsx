import "./SellerProfileLayout.css";
import { chatLink } from "../../lib/chatCache";
import { useAuthContext } from "../../contexts/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import MarketplaceProductCard from "../../components/MarketplaceProductCard";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import TrustBadge from "../../components/TrustBadge";
import { axiosClient } from "../../lib/axiosClient";
import { useAddToCartToast } from "../../hooks/useAddToCartToast";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import type { Product, Review, SellerSummary } from "../../types/marketplace";

type SellerProfileResponse = {
  seller: SellerSummary;
  products: Product[];
  reviews: Review[];
  pagination?: { page: number; limit: number; total: number; hasMore: boolean };
};

const categories = ["Deals", "Grocery", "Electronics", "Mobiles", "Laptops", "Fashion", "Beauty", "Home", "Vehicles", "Accessories"];

const SellerProfilePage = () => {
  const { id } = useParams();
  const { user } = useAuthContext();
  const [data, setData] = useState<SellerProfileResponse | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"products" | "reviews">("products");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const { addProductToCart, cartToast } = useAddToCartToast();

  const query = useMemo(() => ({ page, limit: 20, search, category, sort }), [page, search, category, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingMore(page > 1);
      axiosClient.get<SellerProfileResponse>(`/marketplace/sellers/${id}`, { params: query })
        .then(({ data: next }) => {
          setData((current) => page > 1 && current ? { ...next, products: [...current.products, ...next.products] } : next);
          setError("");
        })
        .catch(() => setError("Seller profile not found."))
        .finally(() => setLoadingMore(false));
    }, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [id, page, query, search]);

  useEffect(() => {
    const updateBackToTop = () => setShowBackToTop(window.scrollY > 700);
    window.addEventListener("scroll", updateBackToTop, { passive: true });
    return () => window.removeEventListener("scroll", updateBackToTop);
  }, []);

  const resetPage = () => setPage(1);

  if (!data) {
    return <main className="private-page">{error ? <div className="private-state error">{error}</div> : <PrivateSkeleton variant="seller" />}</main>;
  }

  const productTotal = data.pagination?.total ?? data.seller.totalProducts ?? data.products.length;
  const hasMoreProducts = data.pagination?.hasMore ?? false;
  const hasAnyProducts = productTotal > 0;
  const filtersApplied = Boolean(search || category || sort !== "newest");

  return (
    <main className="private-page seller-profile-page">
      {cartToast}
      <div className="seller-profile-topbar"><h2>Seller Profile</h2><div className="seller-profile-menu-anchor"><button type="button" aria-label="More seller options" aria-haspopup="menu" aria-expanded={reportMenuOpen} onClick={() => setReportMenuOpen(open => !open)}><MoreHorizOutlinedIcon /></button>{reportMenuOpen ? <><button type="button" className="seller-profile-menu-dismiss" aria-label="Close seller options" onClick={() => setReportMenuOpen(false)} /><div className="seller-profile-dropdown" role="menu"><Link role="menuitem" to="/report-abuse" onClick={() => setReportMenuOpen(false)}>Report seller</Link></div></> : null}</div></div>
      <section className="seller-profile-hero">
        <UserAvatarFrame className="profile-avatar seller-profile-avatar" name={data.seller.displayName} image={data.seller.avatar} frame={data.seller.avatarFrame} size={92} />
        <div className="seller-profile-identity">
          <h1 className="profile-name-line">
            <span className="profile-name-text">{data.seller.displayName}</span>
            <TrustBadge userId={data.seller.uid} />
          </h1>
          <p className="seller-profile-username">@{data.seller.piUsername || data.seller.username}</p>
          {data.seller.uid !== user?.uid ? <Link className="private-primary-button" to={chatLink(data.seller)}>Message</Link> : null}
          
        </div>
        <div className="seller-profile-stats">
          <strong>{data.seller.totalProducts || 0}<span>Products</span></strong>
          <strong>{data.seller.successfulOrders || 0}<span>Successful orders</span></strong>
          <strong>{data.seller.averageRating ? data.seller.averageRating.toFixed(1) : "—"}<span>{data.seller.averageRating ? "Rating" : "No ratings yet"}</span></strong>
        </div>
      </section>
      <p className="seller-joined">Joined {data.seller.createdAt ? new Date(data.seller.createdAt).toLocaleDateString() : "recently"}</p>

      <div className="seller-profile-tabs" role="tablist" aria-label="Seller information"><button type="button" role="tab" aria-selected={activeTab === "products"} className={activeTab === "products" ? "active" : ""} onClick={() => setActiveTab("products")}>Products</button><button type="button" role="tab" aria-selected={activeTab === "reviews"} className={activeTab === "reviews" ? "active" : ""} onClick={() => setActiveTab("reviews")}>Buyer reviews</button></div>
      {activeTab === "products" ? <>
      <section className="section-title seller-products-title"><div><h2>Products listed</h2><p>Showing {data.products.length} of {productTotal}</p></div></section>
      {hasAnyProducts ? <><div className="seller-profile-filterbar"><label className="seller-product-search"><SearchOutlinedIcon aria-hidden="true" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Search seller products..." aria-label="Search seller products" /></label><button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><TuneOutlinedIcon /> Filters</button></div>{filtersOpen ? <section className="seller-product-tools seller-profile-advanced" aria-label="Filter seller products">
        <select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }} aria-label="Sort products">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
        </select>
      </section> : null}</> : null}

      {data.products.length ? (
        <section className="product-grid seller-product-grid">
          {data.products.map((product) => <MarketplaceProductCard key={product._id} product={product} variant="compact" onAddToCart={addProductToCart} />)}
        </section>
      ) : <div className="private-state"><h2>{hasAnyProducts && filtersApplied ? "No matching products" : "No products listed yet"}</h2><p>{hasAnyProducts && filtersApplied ? "Try another search or category." : "This seller hasn’t published any products. Check back later."}</p>{filtersApplied ? <button type="button" className="private-secondary-button" onClick={() => { setSearch(""); setCategory(""); setSort("newest"); resetPage(); }}>Clear filters</button> : null}</div>}

      {hasMoreProducts ? <div className="seller-load-more"><button type="button" className="private-secondary-button" disabled={loadingMore} onClick={() => setPage((value) => value + 1)}>{loadingMore ? "Loading..." : "Load 20 more"}</button></div> : null}

      </> : <section className="reviews-panel">
        <div className="section-title"><div><h2>Buyer reviews</h2><p>{data.reviews.length ? `${data.reviews.length} marketplace reviews` : "No reviews yet"}</p></div></div>
        {data.reviews.map((review) => (
          <article key={review._id}>
            <strong>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</strong>
            <p>{review.message || "Positive completed order."}</p>
            <small>{review.buyerName} · {new Date(review.createdAt).toLocaleDateString()}</small>
          </article>
        ))}
        {!data.reviews.length ? <div className="seller-reviews-empty"><h3>No reviews yet</h3><p>Verified buyer reviews will appear here after eligible purchases.</p></div> : null}
      </section>}
      {showBackToTop ? <button type="button" className="seller-back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">↑</button> : null}
    </main>
  );
};

export default SellerProfilePage;
