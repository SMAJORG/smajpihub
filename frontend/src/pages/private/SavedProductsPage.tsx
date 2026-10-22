import "./SavedProductsPage.css";
import { useEffect, useState } from "react";
import { axiosClient } from "../../lib/axiosClient";
import type { Product } from "../../types/marketplace";
import MarketplaceProductCard from "../../components/MarketplaceProductCard";
import PrivateSkeleton from "../../components/PrivateSkeleton";
const SavedProductsPage = () => { const [products, setProducts] = useState<Product[]>([]); const [loading, setLoading] = useState(true); useEffect(() => { axiosClient.get<{ products: Product[] }>("/marketplace/saved").then(({ data }) => setProducts(data.products)).finally(() => setLoading(false)); }, []); const remove = async (product: Product) => { await axiosClient.post(`/marketplace/products/${product._id}/favorite`); setProducts((items) => items.filter((item) => item._id !== product._id)); }; return <main className="private-page saved-products-page"><section className="private-page-head"><div><p className="private-kicker">YOUR SHORTLIST</p><h1>Saved Products</h1><p>Keep interesting listings close while you compare options.</p></div></section>{loading ? <PrivateSkeleton variant="grid" count={6} /> : products.length ? <section className="product-grid">{products.map((product) => <MarketplaceProductCard key={product._id} product={product} saved onFavorite={(item) => void remove(item)} />)}</section> : <div className="private-state"><h2>Nothing saved yet</h2><p>Use the heart button in the Store to build your shortlist.</p></div>}</main>; };
export default SavedProductsPage;
