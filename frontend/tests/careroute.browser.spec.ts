import { test, expect, type Page } from "@playwright/test";

// Synthetic fixtures are test-only. Production UI receives records from the existing API.
const staff = {
  id: "test-staff",
  hospitalId: "test-hospital",
  username: "test.operator",
  fullName: "Test operator",
  role: "hospital_admin",
};
const hospital = {
  id: staff.hospitalId,
  name: "Test hospital",
  address: "Test address",
  city: "Test city",
  country: "Test country",
  phone: "",
  latitude: 1,
  longitude: 1,
  intakeStatus: "active",
  capabilities: ["General"],
  erCapacityAvailable: 2,
  erCapacityTotal: 4,
};
const request = {
  id: "test-request",
  trackingCode: "CR-TEST-1",
  accessToken: "test-only",
  patientName: "Test patient",
  patientPhone: "",
  patientPiUsername: "test.patient",
  emergencyType: "General emergency",
  severity: "urgent",
  pickupAddress: "Test pickup",
  pickupLatitude: 1,
  pickupLongitude: 1,
  assignedHospitalId: staff.hospitalId,
  assignedHospitalName: hospital.name,
  status: "submitted",
  createdAt: "2026-10-20T12:00:00Z",
  updatedAt: "2026-10-20T12:00:00Z",
};

async function setup(page: Page) {
  page.on("pageerror", error => console.error("CareRoute browser error:", error.message));
  let current = { ...request };
  let failRead = false;
  const mutations: unknown[] = [];
  let hospitalReads = 0;
  await page.addInitScript(() => {
    localStorage.setItem(
      "smaj_pi_user",
      JSON.stringify({ uid: "test-patient", username: "test.patient", accessToken: "test-token" })
    );
    sessionStorage.setItem(
      "smaj_careroute_staff_session_v2",
      JSON.stringify({ id: "test-patient", hospitalId: "test-hospital", role: "hospital_admin" })
    );
  });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path === "/user") return json({ user: { uid: "test-patient", username: "test.patient" } });
    if (path === "/careroute/hospital/login") return json({ staff });
    if (path === "/careroute/hospitals") return json({ hospitals: [hospital] });
    if (path === `/careroute/hospital/${staff.hospitalId}/requests`) {
      hospitalReads++;
      return json({ requests: [current] });
    }
    if (path.startsWith("/careroute/patient/"))
      return json({
        requests: [
          current,
          { ...request, id: "second-active", trackingCode: "CR-TEST-2", status: "accepted" },
          { ...request, id: "old-request", trackingCode: "CR-TEST-3", status: "completed" },
        ],
      });
    if (path.startsWith("/careroute/requests/")) {
      if (route.request().method() === "PATCH") {
        const data = route.request().postDataJSON();
        mutations.push(data);
        current = { ...current, ...data };
        return json({ request: current });
      }
      if (failRead) return json({ message: "Test connection failure" }, 503);
      return json({ request: current });
    }
    if (path.startsWith("/presence") || path.startsWith("/users/presence")) return json({});
    if (route.request().resourceType() === "image" && url.hostname !== "127.0.0.1") return route.abort();
    return route.continue();
  });
  await page.goto("/tests/careroute.html");
  await expect(page.getByRole("heading", { name: "Emergency care, made simple." })).toBeVisible();
  return {
    mutations,
    hospitalReads: () => hospitalReads,
    fail: () => {
      failRead = true;
    },
    status: (status: string) => {
      current = { ...current, status };
    },
  };
}

test("patient pages fit mobile, tablet and desktop with readable actions", async ({ page }) => {
  await setup(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const action = page.getByRole("link", { name: "New emergency request", exact: true });
    const box = await action.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await action.locator("span").evaluate(el => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/careroute-home-mobile.png", fullPage: true });
});

test("a patient Pi account and legacy fabricated staff session cannot open the ER desk", async ({ page }) => {
  const app = await setup(page);
  await page.getByRole("link", { name: "Hospital staff sign-in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your ER desk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request queue" })).toHaveCount(0);
  expect(app.hospitalReads()).toBe(0);
  await page.screenshot({ path: "test-results/careroute-staff-access.png", fullPage: true });
});

test("all active requests stay out of history and missing ETAs are not invented", async ({ page }) => {
  await setup(page);
  await page
    .getByRole("navigation", { name: "CareRoute navigation" })
    .getByRole("link", { name: "My requests" })
    .click();
  await expect(page.locator(".cr-history-card")).toHaveCount(2);
  await expect(page.locator(".cr-history-card").first()).toContainText("Not provided");
  await page.getByRole("button", { name: "History 1" }).click();
  await expect(page.locator(".cr-history-card")).toHaveCount(1);
  await expect(page.locator(".cr-history-card")).toContainText("Care completed");
});

test("tracking reflects recorded status and warns when offline; cancellation requires confirmation", async ({
  page,
  context,
}) => {
  const app = await setup(page);
  await page
    .getByRole("navigation", { name: "CareRoute navigation" })
    .getByRole("link", { name: "Track", exact: true })
    .click();
  await page.getByLabel("Tracking code", { exact: true }).fill(request.trackingCode);
  await page.getByRole("button", { name: "Track request", exact: true }).click();
  await expect(page.locator(".cr-tracking-summary")).toContainText("Not provided");
  await page.getByRole("button", { name: "Cancel request", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(app.mutations).toHaveLength(0);
  app.status("accepted");
  await expect(page.locator(".cr-tracking-summary .cr-status")).toHaveText("Accepted");
  await expect(page.locator(".cr-progress-step[aria-current=step]")).toContainText("Accepted");
  await context.setOffline(true);
  await expect(page.locator(".cr-connection")).toContainText("You're offline");
  await expect(page.locator(".cr-connection")).not.toContainText("Live");
  await context.setOffline(false);
  app.fail();
  await expect(page.locator(".cr-connection-warning")).toContainText("Unable to refresh", { timeout: 30000 });
  await page.screenshot({ path: "test-results/careroute-tracking-disconnected.png", fullPage: true });
});

test("staff sign-in opens the assigned queue; accepting and closing require confirmation", async ({ page }) => {
  const app = await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Hospital staff sign-in" }).click();
  await page.getByLabel("Staff email or username").fill("test.operator");
  await page.getByLabel("Password", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Sign in to hospital", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Request queue", exact: true })).toBeVisible();
  await page.locator(".cr-queue-item").click();
  await page.getByRole("button", { name: "Accept request", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(app.mutations).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm acceptance" }).click();
  await expect(page.locator(".cr-request-details .cr-status")).toHaveText("Accepted");
  expect(app.mutations).toHaveLength(1);
  await page.getByRole("button", { name: "Mark completed", exact: true }).click();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  expect(app.mutations).toHaveLength(1);
  await page.screenshot({ path: "test-results/careroute-hospital-desktop.png", fullPage: true });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "test-results/careroute-hospital-mobile.png", fullPage: true });
});
