export const productSteps = ["Product Information", "Photos & Pricing", "Product Options", "Review & Publish"] as const;
export type ProductIssue = { field: string; step: number; message: string };
type Listing = {
  title: string;
  image: string;
  priceUsdt: string;
  pricePi: string;
  condition: string;
  quantity: string;
  description: string;
  country: string;
  city: string;
  areaAddress: string;
  sellerContact: string;
  deliveryOption: string;
  sellerAgreementAccepted: boolean;
};
// These are the existing Add Product publication requirements, grouped by step.
export function productIssues(form: Listing, sellerActive: boolean): ProductIssue[] {
  const issues: ProductIssue[] = [];
  const check = (invalid: boolean, field: string, step: number, message: string) => {
    if (invalid) issues.push({ field, step, message });
  };
  check(!sellerActive, "sellerActive", 0, "Activate seller tools before submitting a product.");
  check(form.title.trim().length < 3, "title", 0, "Product name must be at least 3 characters.");
  check(!form.condition, "condition", 0, "Choose a condition.");
  check(
    !Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 1,
    "quantity",
    0,
    "Quantity must be at least 1."
  );
  check(form.description.trim().length < 20, "description", 0, "Description must be at least 20 characters.");
  check(!form.image, "images", 1, "Choose a product image before publishing.");
  check(
    !Number.isFinite(Number(form.priceUsdt)) || Number(form.priceUsdt) <= 0,
    "priceUsdt",
    1,
    "Enter a valid USDT price greater than zero."
  );
  check(
    !Number.isFinite(Number(form.pricePi)) || Number(form.pricePi) <= 0,
    "pricePi",
    1,
    "Enter a valid Pi price greater than zero."
  );
  check(!form.deliveryOption, "deliveryOption", 2, "Choose a delivery or service method.");
  check(!form.country.trim(), "country", 3, "Choose a country.");
  check(!form.city.trim(), "city", 3, "Choose a city.");
  check(!form.areaAddress.trim(), "areaAddress", 3, "Enter an area or address summary.");
  check(!form.sellerContact.trim(), "sellerContact", 3, "Enter seller contact information.");
  check(!form.sellerAgreementAccepted, "sellerAgreementAccepted", 3, "Accept the seller agreement before publishing.");
  return issues;
}
export function restoredProductStep(value: string | null) {
  const step = Number(value);
  return Number.isInteger(step) && step >= 0 && step < productSteps.length ? step : 0;
}
