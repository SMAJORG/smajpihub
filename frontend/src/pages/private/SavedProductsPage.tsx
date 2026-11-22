import "./SavedProductsPage.css";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FavoriteBorderOutlinedIcon from "@mui/icons-material/FavoriteBorderOutlined";
import { axiosClient } from "../../lib/axiosClient";
import type { Product } from "../../types/marketplace";
import MarketplaceProductCard from "../../components/MarketplaceProductCard";
import PrivateSkeleton from "../../components/PrivateSkeleton";

type SortOrder = "recent" | "low" | "high";

const SavedProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortOrder>("recent");
  const [removing, setRemoving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axiosClient.get<{ products: Product[] }>("/marketplace/saved");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setError("Saved products could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const sortedProducts = useMemo(() => {
    const items = [...products];
    if (sort === "low") return items.sort((a, b) => a.pricePi - b.pricePi);
    if (sort === "high") return items.sort((a, b) => b.pricePi - a.pricePi);
    return items;
  }, [products, sort]);

  const remove = async (product: Product) => {
    if (removing) return;
    setRemoving(product._id);
    setError("");
    try {
      await axiosClient.post(`/marketplace/products/${product._id}/favorite`);
      setProducts(items => items.filter(item => item._id !== product._id));
    } catch {
      setError("Could not remove this product. Please try again.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <main className="private-page saved-products-page">
      <header className="saved-products-heading">
        <div>
          <h1>Saved Products</h1>
          <p>Your favorite products in one place</p>
        </div>
        <FavoriteBorderOutlinedIcon aria-hidden="true" />
      </header>
      {error ? <div className="saved-products-error" role="alert">{error}{products.length === 0 ? <button type="button" onClick={() => void load()}>Retry</button> : null}</div> : null}
      {loading ? <PrivateSkeleton variant="grid" count={4} /> : products.length > 0 ? (
        <>
          <div className="saved-products-toolbar">
            <span>{products.length} saved {products.length === 1 ? "item" : "items"}</span>
            <label>
              <span className="sr-only">Sort saved products</span>
              <select value={sort} onChange={event => setSort(event.target.value as SortOrder)}>
                <option value="recent">Recently saved</option>
                <option value="low">Price: Low to high</option>
                <option value="high">Price: High to low</option>
              </select>
            </label>
          </div>
          <section className="product-grid saved-products-grid" aria-label="Saved products">
            {sortedProducts.map(product => (
              <MarketplaceProductCard key={product._id} product={product} variant="compact" saved onFavorite={item => { if (!removing) void remove(item); }} />
            ))}
          </section>
        </>
      ) : !error ? (
        <section className="saved-products-empty">
          <span className="saved-products-empty-icon"><FavoriteBorderOutlinedIcon /></span>
          <h2>No saved products yet</h2>
          <p>Tap the heart on a product to save it here for later.</p>
          <Link to="/store" className="saved-products-explore">Explore Store</Link>
        </section>
      ) : null}
    </main>
  );
};

export default SavedProductsPage;
