const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript");
const api = {};
new Function(
  "exports",
  ts.transpileModule(fs.readFileSync("frontend/src/lib/productWizard.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
)(api);
const valid = {
  title: "Real product",
  image: "https://example.com/product.webp",
  priceUsdt: "314159",
  pricePi: "1",
  condition: "Used",
  quantity: "2",
  description: "Accurate product condition and all included accessories.",
  country: "Nigeria",
  city: "Lagos",
  areaAddress: "Real address summary",
  sellerContact: "Seller contact",
  deliveryOption: "Delivery",
  sellerAgreementAccepted: true,
};
test("existing valid listings pass without altering prices, delivery types or advanced data", () => {
  for (const deliveryOption of [
    "Delivery",
    "Pickup",
    "Delivery or Pickup",
    "Digital Delivery",
    "Online Service",
    "In-person Service",
    "Online or In-person",
  ])
    assert.equal(api.productIssues({ ...valid, deliveryOption }, true).length, 0);
  assert.equal(api.productIssues({ ...valid, pricePi: "0.00000001", priceUsdt: "0.001" }, true).length, 0);
});
test("publication errors identify the correct field and wizard step", () => {
  const expected = {
    title: 0,
    condition: 0,
    quantity: 0,
    description: 0,
    image: 1,
    priceUsdt: 1,
    pricePi: 1,
    deliveryOption: 2,
    country: 3,
    city: 3,
    areaAddress: 3,
    sellerContact: 3,
    sellerAgreementAccepted: 3,
  };
  for (const [field, step] of Object.entries(expected)) {
    const errors = api.productIssues({ ...valid, [field]: field === "sellerAgreementAccepted" ? false : "" }, true);
    assert.equal(errors.length, 1, field);
    assert.equal(errors[0].step, step, field);
    assert.equal(errors[0].field, field === "image" ? "images" : field);
  }
  assert.equal(api.productIssues(valid, false)[0].field, "sellerActive");
  for (const value of ["NaN", "Infinity", "-1", "0"])
    assert.ok(api.productIssues({ ...valid, pricePi: value }, true).some(issue => issue.field === "pricePi"));
});
test("draft progress restores only one of the four real steps", () => {
  for (let step = 0; step < 4; step++) assert.equal(api.restoredProductStep(String(step)), step);
  for (const value of [null, "bad", "-1", "4", "2.5"]) assert.equal(api.restoredProductStep(value), 0);
});
