import { Link } from "react-router-dom";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import FavoriteIcon from "@mui/icons-material/Favorite";
import AddShoppingCartOutlinedIcon from "@mui/icons-material/AddShoppingCartOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarHalfIcon from "@mui/icons-material/StarHalf";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import TrustBadge from "./TrustBadge";
import type { Product } from "../types/marketplace";
import {
  countryCode,
  countryDisplayName,
  countryFlag,
  formatPiAmount,
  formatUsdAmount,
} from "../lib/formatters";
import { PI_USDT_RATE, piFromUsdt } from "../lib/piPricing";

const usdt = (product: Product) =>
  formatUsdAmount(product.priceUsdt ?? product.pricePi * PI_USDT_RATE);

const pi = (product: Product) =>
  product.pricePi > 0
    ? product.pricePi
    : piFromUsdt(product.priceUsdt || 0);

const countryTokens = [
  "United Arab Emirates",
  "UAE",
  "United States",
  "USA",
  "Germany",
  "Italy",
  "United Kingdom",
  "UK",
  "Nigeria",
  "India",
  "Pakistan",
  "Philippines",
  "Malaysia",
  "Indonesia",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Turkey",
  "Egypt",
  "Morocco",
  "Kenya",
];

const productCountry = (product: Product) => {
  const explicitCountry = product.country?.trim();

  if (explicitCountry) {
    return explicitCountry;
  }

  const location = product.location || "";

  const splitCountry = location
    .split(/\s+-\s+|,/)
    .map((item) => item.trim())
    .find((item) => countryFlag(item));

  if (splitCountry) {
    return splitCountry;
  }

  return (
    countryTokens.find((country) =>
      new RegExp(
        `\\b${country.replace(/\s+/g, "\\s+")}\\b`,
        "i",
      ).test(location),
    ) || ""
  );
};

type MarketplaceProductCardProps = {
  product: Product;
  variant?: "default" | "compact";
  saved?: boolean;
  onFavorite?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onBuy?: (product: Product) => void;
};

const MarketplaceProductCard = ({
  product,
  variant = "default",
  saved,
  onFavorite,
  onAddToCart,
}: MarketplaceProductCardProps) => {
  const compact = variant === "compact";

  const countrySource = productCountry(product);
  const country = countryDisplayName(countrySource);
  const flagCode = countryCode(countrySource);

  const locationParts = (product.location || "").split(/\s+-\s+/).map((item) => item.trim());
  const city = product.city?.trim() || locationParts[2] || "City unavailable";

  const reviewCount = product.reviewCount || 0;
  const rating = reviewCount > 0 ? Math.max(0, Math.min(5, product.rating || 0)) : 0;
  const reviewLabel = reviewCount > 0 ? `${rating.toFixed(1)} (${reviewCount})` : "No reviews yet";

  const ratingLabel = reviewCount > 0
    ? `${rating.toFixed(1)} out of 5 from ${reviewCount} reviews`
    : "No reviews yet";

  const imageCount = Math.max(
    product.images?.length || (product.image ? 1 : 0),
    1,
  );

  const availabilityLabel =
    typeof product.quantity === "number" && product.quantity <= 0
      ? "Out of Stock"
      : "In Stock";

  return (
    <article
      className={`product-card product-card-link storefront-product-card${
        compact ? " storefront-product-card-compact" : ""
      }`}
    >
      {flagCode ? (
        <span
          className="storefront-card-country"
          aria-label={country}
          title={country}
        >
          <img src={`https://flagcdn.com/w40/${flagCode.toLowerCase()}.png`} alt="" loading="lazy" />
        </span>
      ) : null}

      <span className="storefront-product-badge">
        {product.condition || "New"}
      </span>

      {onFavorite ? (
        <button
          className="favorite-button storefront-favorite-button"
          type="button"
          onClick={() => onFavorite(product)}
          aria-label={
            saved ? "Remove from wishlist" : "Add to wishlist"
          }
        >
          {saved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
        </button>
      ) : null}

      <Link
        to={`/product/${product._id}`}
        aria-label={`View ${product.title}`}
      >
        <div className="product-image-wrap storefront-product-image-wrap">
          {product.image ? (
            <img src={product.image} alt={product.title} />
          ) : (
            <span>No image</span>
          )}

          <span className="storefront-image-count">
            1/{imageCount}
          </span>
        </div>

        <div className="product-card-body storefront-product-body">
          <h2 translate="no" dir="auto">{product.title}</h2>

          <div className="storefront-product-rating">
            <span
              className="storefront-stars"
              aria-label={ratingLabel}
            >
              {Array.from({ length: 5 }).map((_, index) => {
                if (rating >= index + 1) return <StarIcon className="star-filled" key={index} />;
                if (rating >= index + 0.5) return <StarHalfIcon className="star-half" key={index} />;
                return <StarBorderIcon className="star-empty" key={index} />;
              })}
            </span>

            <small>{reviewLabel}</small>
          </div>

          <div className="storefront-price-stack">
            <strong>{usdt(product)}</strong>
            <small>{formatPiAmount(pi(product))}</small>
          </div>

          <div className="storefront-seller-block">
            <span className="storefront-seller-avatar">
              {product.sellerAvatar ? (
                <img
                  src={product.sellerAvatar}
                  alt={product.sellerName || "Seller"}
                />
              ) : (
                <AccountCircleIcon />
              )}
            </span>

            <span className="storefront-seller-details">
              <span className="storefront-seller-name">
                <small className="seller-name-text">
                  {product.sellerName || "SMAJ Seller"}
                </small>

                <TrustBadge
                  level={product.verificationLevel}
                  status={product.verificationStatus}
                />
              </span>

              <small className="storefront-seller-location">
                <LocationOnOutlinedIcon />

                <span>{city}</span>

                {flagCode ? (
                  <span
                    className="seller-country-flag"
                    aria-label={country}
                  >
                    <img src={`https://flagcdn.com/w40/${flagCode.toLowerCase()}.png`} alt="" loading="lazy" />
                  </span>
                ) : null}
              </small>
            </span>
          </div>

          <div
            className={`storefront-stock-row${
              availabilityLabel === "Out of Stock"
                ? " storefront-stock-row-empty"
                : ""
            }`}
          >
            <span>
              <i />
              {availabilityLabel}
            </span>
          </div>
        </div>
      </Link>

      <div className="storefront-product-actions">
        <button
          className="product-action-button product-action-secondary storefront-product-cart"
          type="button"
          onClick={() => onAddToCart?.(product)}
          aria-label={`Add ${product.title} to cart`}
          title="Add to cart"
          disabled={availabilityLabel === "Out of Stock"}
        >
          <AddShoppingCartOutlinedIcon />
        </button>
      </div>
    </article>
  );
};

export default MarketplaceProductCard;
