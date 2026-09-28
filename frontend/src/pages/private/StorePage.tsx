import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import ArrowForwardIosOutlinedIcon from "@mui/icons-material/ArrowForwardIosOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { axiosClient } from "../../lib/axiosClient";
import MarketplaceProductCard from "../../components/MarketplaceProductCard";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import { useAuthContext } from "../../contexts/AuthContext";
import { CART_UPDATED_EVENT, getCartQuantity, setBuyNowItem } from "../../lib/storeCart";
import { useAddToCartToast } from "../../hooks/useAddToCartToast";
import type { Product } from "../../types/marketplace";
import { heroSlides, promoStripItems } from "../../content/storefront";
import { getHeroBanners } from "../../lib/heroBanners";
import logoImage from "/logo.png";
import { PI_USDT_RATE } from "../../lib/piPricing";

const STORE_CATEGORIES = ["Deals", "Grocery", "Electronics", "Mobiles", "Laptops", "Fashion", "Beauty", "Home", "Vehicles", "Accessories"];
const STORE_SEARCH_FALLBACKS = [
  "iPhone", "Samsung phones", "laptops", "wireless headphones", "smart watches",
  "gaming consoles", "cameras", "men's shoes", "women's dresses", "handbags",
  "perfume", "skin care", "home furniture", "kitchen appliances", "televisions",
  "car accessories", "baby products", "fitness equipment", "jewelry", "daily deals",
];
const mobileMenuCategories = ["Electronics", "Women's Fashion", "Men's Fashion", "Kids Fashion", "Home, Kitchen & Appliances", "Beauty & Fragrance", "Toys", "Baby", "Health & Nutrition"];
const mobileMenuSubcategories: Record<string, string[]> = {
  Electronics: ["Mobiles & Accessories", "iPhone 17 Series", "Laptops & Accessories", "Gaming Essentials", "TVs & Home Entertainment", "Cameras", "All Electronics"],
  "Women's Fashion": ["Dresses", "Shoes", "Bags", "Jewelry", "Beauty Deals", "All Women's Fashion"],
  "Men's Fashion": ["Shirts", "Shoes", "Watches", "Bags", "Grooming", "All Men's Fashion"],
  "Kids Fashion": ["Girls", "Boys", "Baby Clothing", "School Shoes", "Kids Accessories", "All Kids Fashion"],
  "Home, Kitchen & Appliances": ["Kitchen Appliances", "Cookware", "Furniture", "Bedding", "Home Decor", "All Home"],
  "Beauty & Fragrance": ["Perfume", "Skin Care", "Hair Care", "Makeup", "Personal Care", "All Beauty"],
  Toys: ["Learning Toys", "Outdoor Play", "Remote Control", "Baby Toys", "Games", "All Toys"],
  Baby: ["Diapers", "Feeding", "Strollers", "Baby Care", "Baby Clothing", "All Baby"],
  "Health & Nutrition": ["Vitamins", "Fitness", "Wellness", "Medical Supplies", "Nutrition", "All Health"],
};
const sortOptions = [
  ["newest", "Newest"], ["oldest", "Oldest"], ["price-low", "Price: Low to High"],
  ["price-high", "Price: High to Low"], ["popular", "Most Popular"], ["rated", "Best Rated"],
] as const;
const StorePage = () => {
  const { user } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [search, setSearch] = useState(params.get("search") || "");
  const collection = params.get("collection") || "";
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestionIndex, setSearchSuggestionIndex] = useState(0);
  const [category, setCategory] = useState(params.get("category") || "All");
  const [openShoppingTool, setOpenShoppingTool] = useState("");
  const [sort, setSort] = useState(params.get("sort") || "newest");
  const [condition, setCondition] = useState(params.get("condition") || "All");
  const [verifiedOnly, setVerifiedOnly] = useState(params.get("verified") === "true");
  const [inStockOnly, setInStockOnly] = useState(params.get("stock") === "true");
  const [minPrice, setMinPrice] = useState(params.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(params.get("maxPrice") || "");
  const [locationFilter, setLocationFilter] = useState(params.get("location") || "All");
  const shoppingToolsRef = useRef<HTMLElement | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [displayHeroSlides, setDisplayHeroSlides] = useState(heroSlides);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuPanel, setMobileMenuPanel] = useState<"categories" | "subcategories">("categories");
  const [mobileMenuCategory, setMobileMenuCategory] = useState(mobileMenuCategories[0]);
  const [cartQuantity, setCartQuantity] = useState(() => getCartQuantity());
  const { addProductToCart, cartToast } = useAddToCartToast();
  const profileName = user?.displayName || user?.username || "Pi User";

  const loadCatalog = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const [feed, all, saved] = await Promise.all([
        axiosClient.get<{ latest?: Product[]; recommended?: Product[]; savedIds?: string[]; products?: Product[] }>("/marketplace/feed"),
        axiosClient.get<{ products: Product[] }>("/marketplace/products"),
        axiosClient.get<{ products: Product[] }>("/marketplace/saved").catch(() => null),
      ]);
      const live = [...(feed.data.recommended || []), ...(feed.data.latest || []), ...(all.data.products || [])];
      const unique = Array.from(new Map(live.map((item) => [item._id, item])).values());
      setProducts(unique);
      setSavedIds(feed?.data?.savedIds || saved?.data?.products.map((item) => item._id) || []);
      setCatalogError("");
    } catch {
      setProducts([]);
      setSavedIds([]);
      setCatalogError("SMAJ Store cannot reach the live catalog. Check the backend, MongoDB, session, and CORS settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog(true);
  }, [loadCatalog]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => setHeroIndex((value) => (value + 1) % displayHeroSlides.length), 4800);
    return () => window.clearInterval(timer);
  }, [displayHeroSlides.length]);

  useEffect(() => {
    void getHeroBanners("store").then((banners) => {
      if (banners.length) {
        setDisplayHeroSlides(banners.map((banner) => ({ title: banner.title || "SMAJ Store", subtitle: banner.subtitle || "Discover products from SMAJ sellers.", image: banner.image, search: banner.search || banner.title, textColor: banner.textColor || "#ffffff" })));
        setHeroIndex(0);
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const syncCartQuantity = () => setCartQuantity(getCartQuantity());
    window.addEventListener(CART_UPDATED_EVENT, syncCartQuantity);
    window.addEventListener("storage", syncCartQuantity);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, syncCartQuantity);
      window.removeEventListener("storage", syncCartQuantity);
    };
  }, []);

  const availableCategories = useMemo(() => ["All", ...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  const availableLocations = useMemo(() => ["All", ...new Set(products.flatMap((product) => [product.country, product.stateRegion, product.city]).filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))], [products]);
  const searchSuggestions = useMemo(() => {
    const productTitles = products.map((product) => product.title?.trim()).filter((title): title is string => Boolean(title));
    return Array.from(new Set([...productTitles, ...STORE_SEARCH_FALLBACKS])).slice(0, 20);
  }, [products]);

  useEffect(() => {
    if (searchFocused || search.trim() || searchSuggestions.length < 2) return;
    const timer = window.setInterval(() => {
      setSearchSuggestionIndex((current) => (current + 1) % searchSuggestions.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [search, searchFocused, searchSuggestions.length]);

  useEffect(() => {
    setSearchSuggestionIndex((current) => current % Math.max(searchSuggestions.length, 1));
  }, [searchSuggestions.length]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minimum = minPrice === "" ? null : Number(minPrice);
    const maximum = maxPrice === "" ? null : Number(maxPrice);
    const filtered = products.filter((product) => {
      const price = product.priceUsdt ?? product.pricePi * PI_USDT_RATE;
      const verified = product.verificationStatus === "approved" && ["pi_verified", "seller_verified", "trusted_seller"].includes(product.verificationLevel || "");
      const inStock = product.productStatus !== "out_of_stock" && (product.quantity === undefined || product.quantity > 0) && (product.variants?.length ? product.variants.some((variant) => (variant.stock || 0) > 0) : true);
      const matchesLocation = locationFilter === "All" || [product.country, product.stateRegion, product.city, product.location].some((value) => value?.toLowerCase().includes(locationFilter.toLowerCase()));
      return (category === "All" || product.category === category)
        && (condition === "All" || product.condition === condition)
        && (!verifiedOnly || verified)
        && (!inStockOnly || inStock)
        && (minimum === null || !Number.isFinite(minimum) || price >= minimum)
        && (maximum === null || !Number.isFinite(maximum) || price <= maximum)
        && matchesLocation
        && (!query || [product.title, product.category, product.description, product.sellerName].join(" ").toLowerCase().includes(query));
    });
    return filtered.sort((left, right) => {
      const leftPrice = left.priceUsdt ?? left.pricePi * PI_USDT_RATE;
      const rightPrice = right.priceUsdt ?? right.pricePi * PI_USDT_RATE;
      if (sort === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (sort === "price-low") return leftPrice - rightPrice;
      if (sort === "price-high") return rightPrice - leftPrice;
      if (sort === "popular") return (right.viewCount || 0) - (left.viewCount || 0);
      if (sort === "rated") return (right.rating || 0) - (left.rating || 0);
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [category, condition, inStockOnly, locationFilter, maxPrice, minPrice, products, search, sort, verifiedOnly]);

  const hasActiveFilters = Boolean(collection) || category !== "All" || condition !== "All" || verifiedOnly || inStockOnly || minPrice !== "" || maxPrice !== "" || locationFilter !== "All" || sort !== "newest";
  const showSearchResults = Boolean(search.trim()) || hasActiveFilters;
  const activeProducts = showSearchResults ? visibleProducts : products;
  const storefrontSections = useMemo(() => {
    const newest = [...products].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const popular = [...products].sort((left, right) => ((right.viewCount || 0) + (right.rating || 0) * 10 + (right.reviewCount || 0) * 3) - ((left.viewCount || 0) + (left.rating || 0) * 10 + (left.reviewCount || 0) * 3));
    const categoryGroups = Array.from(new Set(products.map((product) => product.category).filter(Boolean)))
      .map((name) => ({ name, products: products.filter((product) => product.category === name) }))
      .filter((section) => section.products.length >= 2)
      .sort((left, right) => right.products.length - left.products.length)
      .slice(0, 6);

    return [
      { title: "Recommended for you", products: popular.slice(0, 12), category: "All", collection: "recommended", sort: "popular" },
      { title: "New arrivals", products: newest.slice(0, 12), category: "All", collection: "new-arrivals", sort: "newest" },
      ...categoryGroups.map((section) => ({ title: section.name, products: section.products.slice(0, 12), category: section.name, collection: "", sort: "newest" })),
    ].filter((section) => section.products.length);
  }, [products]);
  const scrollStoreRail = (railId: string, direction: -1 | 1) => {
    const rail = document.getElementById(railId);
    rail?.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.85, 240), behavior: "smooth" });
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("collection");
      if (value.trim()) next.set("search", value);
      else next.delete("search");
      return next;
    }, { replace: true });
  };
  const searchField = (mobile = false) => (
    <label className={`storefront-search${mobile ? " storefront-mobile-search" : ""}`}>
      <SearchOutlinedIcon />
      <span className="storefront-search-field">
        <input
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          aria-label="Search products"
        />
        {!search && !searchFocused ? (
          <span key={searchSuggestionIndex} className="storefront-search-suggestion" aria-hidden="true">
            Search {searchSuggestions[searchSuggestionIndex] || "products"}
          </span>
        ) : null}
      </span>
    </label>
  );

  const updateFilterParam = (key: string, value: string, defaultValue = "") => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };

  const clearStoreFilters = () => {
    setSort("newest"); setCondition("All"); setVerifiedOnly(false); setInStockOnly(false);
    setMinPrice(""); setMaxPrice(""); setLocationFilter("All"); updateCategory("All");
    setParams((current) => {
      const next = new URLSearchParams(current);
      ["sort", "condition", "verified", "stock", "minPrice", "maxPrice", "location", "category", "collection"].forEach((key) => next.delete(key));
      return next;
    }, { replace: true });
    setOpenShoppingTool("");
  };

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      if (!shoppingToolsRef.current?.contains(event.target as Node)) setOpenShoppingTool("");
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenShoppingTool(""); };
    document.addEventListener("pointerdown", closeMenus);
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeMenus); window.removeEventListener("keydown", closeOnEscape); };
  }, []);

  const toggleFavorite = async (product: Product) => {
    const { data } = await axiosClient.post<{ saved: boolean }>(`/marketplace/products/${product._id}/favorite`);
    setSavedIds((current) => data.saved ? [...new Set([...current, product._id])] : current.filter((id) => id !== product._id));
  };

  const goToCheckout = (product: Product) => {
    setBuyNowItem(product);
    navigate("/checkout");
  };

  const updateCategory = (value: string) => {
    setCategory(value);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("collection");
      if (value === "All") next.delete("category");
      else next.set("category", value);
      return next;
    });
  };

  const openStorefrontSection = (section: (typeof storefrontSections)[number]) => {
    setSearch("");
    setCategory(section.category);
    setSort(section.sort);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("search");
      if (section.category === "All") next.delete("category");
      else next.set("category", section.category);
      if (section.sort === "newest") next.delete("sort");
      else next.set("sort", section.sort);
      if (section.collection) next.set("collection", section.collection);
      else next.delete("collection");
      return next;
    });
  };

  const chooseMobileCategory = (value: string) => {
    if (mobileMenuSubcategories[value]?.length) {
      setMobileMenuCategory(value);
      setMobileMenuPanel("subcategories");
      return;
    }
    updateSearch(value);
    if (STORE_CATEGORIES.includes(value)) updateCategory(value);
    setMobileMenuOpen(false);
  };

  const chooseMobileSubcategory = (value: string) => {
    updateSearch(value);
    const normalizedCategory = mobileMenuCategory.includes("Fashion")
      ? "Fashion"
      : mobileMenuCategory.startsWith("Home")
        ? "Home"
        : mobileMenuCategory.startsWith("Beauty")
          ? "Beauty"
          : mobileMenuCategory.startsWith("Health")
            ? "All"
            : mobileMenuCategory;
    updateCategory(STORE_CATEGORIES.includes(normalizedCategory) ? normalizedCategory : "All");
    setMobileMenuOpen(false);
    setMobileMenuPanel("categories");
  };

  return (
    <main className="private-page storefront-page">
      <PullToRefresh onRefresh={() => loadCatalog(false)} />
      {cartToast}
      <section className="storefront-shell">
        <header className={`storefront-header ${mobileMenuOpen ? "storefront-header-menu-open" : ""}`}>
          <div className="storefront-header-main">
            <Link to="/app/services" className="storefront-back-link">
              <ArrowBackIosNewOutlinedIcon />
              <span>Services</span>
            </Link>
            <Link to="/store" className="storefront-brand storefront-brand-link">
              <strong>SMAJ Store</strong>
              <span className="environment-badge storefront-environment-badge" aria-label="Testnet beta environment">Testnet / Beta</span>
            </Link>
            <button type="button" className="storefront-location storefront-location-button" onClick={() => updateSearch("Abu Dhabi")}>
              <LocationOnOutlinedIcon />
              <span>Location</span>
              <KeyboardArrowDownOutlinedIcon className="storefront-location-chevron" />
            </button>
            {searchField()}
            <nav className="storefront-quick-links">
              <Link to="/orders"><span>Orders</span></Link>
              <Link to="/saved"><span>Wishlist</span></Link>
              <Link to="/cart" className="storefront-cart-link">
                <span>Cart</span>
                {cartQuantity ? <b className="storefront-cart-count">{cartQuantity > 99 ? "99+" : cartQuantity}</b> : null}
              </Link>
              <Link to="/profile"><span>Profile</span></Link>
            </nav>
          </div>

          <div className="storefront-mobile-top">
            <button type="button" className="storefront-mobile-menu-button" aria-label="Open categories menu" onClick={() => { setMobileMenuPanel("categories"); setMobileMenuOpen(true); }}>
              <MenuOutlinedIcon />
            </button>
            <Link to="/store" className="storefront-mobile-logo" aria-label="SMAJ Store">
              <img src={logoImage} alt="SMAJ Store" />
            </Link>
            <span className="environment-badge storefront-mobile-environment-badge" aria-label="Testnet beta environment">Beta</span>
            <div className="storefront-mobile-actions">
              <Link to="/cart" className="storefront-cart-link" aria-label={`Cart${cartQuantity ? `, ${cartQuantity} item${cartQuantity === 1 ? "" : "s"}` : ""}`}>
                <ShoppingCartOutlinedIcon />
                {cartQuantity ? <b className="storefront-cart-count">{cartQuantity > 99 ? "99+" : cartQuantity}</b> : null}
              </Link>
              <Link to="/profile" className="storefront-avatar-link" aria-label="Profile">
                {user?.avatar ? <img src={user.avatar} alt="" /> : <span>{profileName.slice(0, 1).toUpperCase()}</span>}
              </Link>
            </div>
          </div>

          {searchField(true)}

          {mobileMenuOpen ? (
            <div className="storefront-mobile-drawer-wrap">
              <button type="button" className="storefront-mobile-drawer-backdrop" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />
              <aside className="storefront-mobile-drawer" aria-label="SMAJ Store categories menu">
                <div className="storefront-mobile-drawer-panels" style={{ transform: mobileMenuPanel === "subcategories" ? "translateX(-50%)" : "translateX(0)" }}>
                  <section className="storefront-mobile-drawer-panel">
                    <header>
                      <Link to="/store" aria-label="SMAJ Store" onClick={() => setMobileMenuOpen(false)}><img src={logoImage} alt="SMAJ Store" /></Link>
                      <button type="button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}><CloseOutlinedIcon /></button>
                    </header>
                    <h3>Categories</h3>
                    <nav>
                      {mobileMenuCategories.map((item) => (
                        <button type="button" key={item} onClick={() => chooseMobileCategory(item)}>
                          <span>{item}</span>
                          <ArrowForwardIosOutlinedIcon />
                        </button>
                      ))}
                    </nav>
                  </section>
                  <section className="storefront-mobile-drawer-panel">
                    <header>
                      <button type="button" className="storefront-mobile-drawer-back" aria-label="Back to categories" onClick={() => setMobileMenuPanel("categories")}><ArrowBackIosNewOutlinedIcon /></button>
                      <h3>{mobileMenuCategory}</h3>
                      <button type="button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}><CloseOutlinedIcon /></button>
                    </header>
                    <nav>
                      {(mobileMenuSubcategories[mobileMenuCategory] || []).map((item) => (
                        <button type="button" key={item} onClick={() => chooseMobileSubcategory(item)}>
                          <span>{item}</span>
                          <ArrowForwardIosOutlinedIcon />
                        </button>
                      ))}
                    </nav>
                  </section>
                </div>
              </aside>
            </div>
          ) : null}
        </header>

        <section ref={shoppingToolsRef} className="storefront-shopping-tools" aria-label="Shopping tools">
          <div className={`storefront-tool-menu ${openShoppingTool === "Sort" ? "open" : ""}`}>
            <button type="button" className="storefront-tool-trigger" aria-expanded={openShoppingTool === "Sort"} onClick={() => setOpenShoppingTool((value) => value === "Sort" ? "" : "Sort")}>
              <span>{sort === "newest" ? "Sort" : sortOptions.find(([value]) => value === sort)?.[1] || "Sort"}</span><KeyboardArrowDownOutlinedIcon />
            </button>
            {openShoppingTool === "Sort" ? <div className="storefront-tool-panel">
              {sortOptions.map(([value, label]) => <button type="button" className={sort === value ? "active" : ""} key={value} onClick={() => { setSort(value); updateFilterParam("sort", value, "newest"); setOpenShoppingTool(""); }}>{label}</button>)}
            </div> : null}
          </div>

          <div className={`storefront-tool-menu ${openShoppingTool === "Filter" ? "open" : ""}`}>
            <button type="button" className="storefront-tool-trigger" aria-expanded={openShoppingTool === "Filter"} onClick={() => setOpenShoppingTool((value) => value === "Filter" ? "" : "Filter")}>
              <span>Filter{category !== "All" || condition !== "All" || verifiedOnly || inStockOnly ? " •" : ""}</span><KeyboardArrowDownOutlinedIcon />
            </button>
            {openShoppingTool === "Filter" ? <div className="storefront-tool-panel storefront-filter-panel">
              <label>Category<select value={category} onChange={(event) => updateCategory(event.target.value)}>{availableCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Condition<select value={condition} onChange={(event) => { setCondition(event.target.value); updateFilterParam("condition", event.target.value, "All"); }}><option>All</option>{["New", "Like New", "Used", "Refurbished"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="storefront-filter-check"><input type="checkbox" checked={verifiedOnly} onChange={(event) => { setVerifiedOnly(event.target.checked); updateFilterParam("verified", event.target.checked ? "true" : ""); }} /><span>Verified sellers only</span></label>
              <label className="storefront-filter-check"><input type="checkbox" checked={inStockOnly} onChange={(event) => { setInStockOnly(event.target.checked); updateFilterParam("stock", event.target.checked ? "true" : ""); }} /><span>In-stock products only</span></label>
            </div> : null}
          </div>

          <div className={`storefront-tool-menu ${openShoppingTool === "Price" ? "open" : ""}`}>
            <button type="button" className="storefront-tool-trigger" aria-expanded={openShoppingTool === "Price"} onClick={() => setOpenShoppingTool((value) => value === "Price" ? "" : "Price")}>
              <span>Price{minPrice || maxPrice ? " •" : ""}</span><KeyboardArrowDownOutlinedIcon />
            </button>
            {openShoppingTool === "Price" ? <div className="storefront-tool-panel storefront-price-panel">
              <label>Minimum USDT<input type="number" min="0" inputMode="decimal" value={minPrice} onChange={(event) => { setMinPrice(event.target.value); updateFilterParam("minPrice", event.target.value); }} placeholder="0" /></label>
              <label>Maximum USDT<input type="number" min="0" inputMode="decimal" value={maxPrice} onChange={(event) => { setMaxPrice(event.target.value); updateFilterParam("maxPrice", event.target.value); }} placeholder="No maximum" /></label>
              <button type="button" onClick={() => { setMinPrice(""); setMaxPrice(""); updateFilterParam("minPrice", ""); updateFilterParam("maxPrice", ""); }}>Clear price</button>
            </div> : null}
          </div>

          <div className={`storefront-tool-menu ${openShoppingTool === "Nearby" ? "open" : ""}`}>
            <button type="button" className="storefront-tool-trigger" aria-expanded={openShoppingTool === "Nearby"} onClick={() => setOpenShoppingTool((value) => value === "Nearby" ? "" : "Nearby")}>
              <span>{locationFilter === "All" ? "Nearby" : locationFilter}</span><KeyboardArrowDownOutlinedIcon />
            </button>
            {openShoppingTool === "Nearby" ? <div className="storefront-tool-panel storefront-location-panel">
              {user?.country ? <button type="button" onClick={() => { setLocationFilter(user.country || "All"); updateFilterParam("location", user.country || ""); setOpenShoppingTool(""); }}>Near me ({user.country})</button> : null}
              <label>Product location<select value={locationFilter} onChange={(event) => { setLocationFilter(event.target.value); updateFilterParam("location", event.target.value, "All"); setOpenShoppingTool(""); }}>{availableLocations.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div> : null}
          </div>

          {hasActiveFilters ? <button type="button" className="storefront-clear-tools" onClick={clearStoreFilters}>Clear all</button> : null}
        </section>

        <section className="storefront-promo-strip" aria-label="Store benefits">
          <div>{[...promoStripItems, ...promoStripItems, ...promoStripItems].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div>
        </section>

        <section className="storefront-hero">
          <button type="button" className="storefront-arrow left" onClick={() => setHeroIndex((value) => (value - 1 + displayHeroSlides.length) % displayHeroSlides.length)} aria-label="Previous banner"><ArrowBackIosNewOutlinedIcon /></button>
          <div className="storefront-hero-track" style={{ transform: `translateX(-${heroIndex * 100}%)` }}>
            {displayHeroSlides.map((slide) => (
              <article className="storefront-hero-slide" key={slide.title} style={{ color: slide.textColor || "#ffffff" }}>
                <img src={slide.image} alt={slide.title} />
                <div>
                  <span>SMAJ Store</span>
                  <h1>{slide.title}</h1>
                  <p>{slide.subtitle}</p>
                  <button type="button" onClick={() => updateSearch(slide.search)}>Shop now</button>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="storefront-arrow right" onClick={() => setHeroIndex((value) => (value + 1) % displayHeroSlides.length)} aria-label="Next banner"><ArrowForwardIosOutlinedIcon /></button>
          <div className="storefront-hero-dots">{displayHeroSlides.map((slide, index) => <button type="button" key={slide.title} className={heroIndex === index ? "active" : ""} onClick={() => setHeroIndex(index)} aria-label={`Go to ${slide.title}`} />)}</div>
        </section>

        {catalogError ? <div className="private-alert error">{catalogError}</div> : null}
        {loading ? <PrivateSkeleton variant="grid" count={6} /> : null}
        {!loading && products.length && !showSearchResults ? (
          <div className="storefront-home-sections">
            {storefrontSections.map((section, sectionIndex) => {
              return (
                <section className="storefront-search-results storefront-home-section" key={`${section.title}-${sectionIndex}`}>
                  <div className="storefront-section-head">
                    <h2>{section.title}</h2>
                    <div className="storefront-section-actions">
                      <button type="button" className="storefront-see-all" onClick={() => openStorefrontSection(section)}>See all <span aria-hidden="true">→</span></button>
                    </div>
                  </div>
                  <div className="storefront-product-grid storefront-section-rail">
                    {section.products.map((product) => <MarketplaceProductCard key={`${sectionIndex}-${product._id}`} product={product} variant="compact" saved={savedIds.includes(product._id)} onFavorite={(item) => void toggleFavorite(item)} onAddToCart={addProductToCart} onBuy={goToCheckout} />)}
                  </div>
                </section>
              );
            })}
            <section className="storefront-search-results storefront-discovery-section">
              <div className="storefront-section-head">
                <div><h2>More to explore</h2></div>
                <div className="storefront-section-actions">
                  <button type="button" className="storefront-rail-arrow previous" onClick={() => scrollStoreRail("storefront-explore-rail", -1)} aria-label="Scroll more products left"><ArrowBackIosNewOutlinedIcon /></button>
                  <button type="button" className="storefront-rail-arrow next" onClick={() => scrollStoreRail("storefront-explore-rail", 1)} aria-label="Scroll more products right"><ArrowForwardIosOutlinedIcon /></button>
                </div>
              </div>
              <div className="storefront-product-grid storefront-section-rail" id="storefront-explore-rail">
                {products.map((product) => <MarketplaceProductCard key={`explore-${product._id}`} product={product} variant="compact" saved={savedIds.includes(product._id)} onFavorite={(item) => void toggleFavorite(item)} onAddToCart={addProductToCart} onBuy={goToCheckout} />)}
              </div>
            </section>
          </div>
        ) : null}

        {showSearchResults ? (
          <section className="storefront-search-results">
            <div className="storefront-section-head">
              <div><h2>{search ? `Results for "${search}"` : collection === "recommended" ? "Recommended for you" : collection === "new-arrivals" ? "New arrivals" : `${category} products`}</h2><p>{visibleProducts.length} products found</p></div>
            </div>
            {visibleProducts.length ? <>
              <div className="storefront-product-grid search-grid">
              {activeProducts.map((product) => (
                <MarketplaceProductCard
                  key={`search-${product._id}`}
                  product={product}
                  variant="compact"
                  saved={savedIds.includes(product._id)}
                  onFavorite={(item) => void toggleFavorite(item)}
                  onAddToCart={addProductToCart}
                  onBuy={goToCheckout}
                />
              ))}
            </div>
            </> : <div className="private-state"><h2>No real products found</h2><p>Try another search or add a seller product.</p></div>}
          </section>
        ) : null}

        <footer className="storefront-footer">
          <div className="storefront-footer-grid">
            <article>
              <strong>SMAJ Store</strong>
              <p>Real seller products, Pi checkout, and marketplace updates in one place.</p>
            </article>
            <article>
              <strong>Shop</strong>
              <button type="button" onClick={() => updateCategory("Deals")}>Deals</button>
              <button type="button" onClick={() => updateCategory("Electronics")}>Electronics</button>
              <button type="button" onClick={() => updateCategory("Fashion")}>Fashion</button>
            </article>
            <article>
              <strong>Seller</strong>
              <button type="button" onClick={() => navigate("/seller")}>Seller Dashboard</button>
              <button type="button" onClick={() => navigate("/add-product")}>Add Product</button>
            </article>
            <article>
              <strong>Account</strong>
              <button type="button" onClick={() => navigate("/orders")}>Orders</button>
              <button type="button" onClick={() => navigate("/saved")}>Saved Products</button>
            </article>
          </div>
          <div className="storefront-footer-bottom">
            <span>Part of SMAJ PI HUB</span>
            <span>Secure marketplace for Pi users.</span>
          </div>
        </footer>
      </section>
    </main>
  );
};

export default StorePage;
