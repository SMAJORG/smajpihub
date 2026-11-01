import { expect, test } from "@playwright/test";

const user = {
  uid: "pi-test-user",
  username: "test-pioneer",
  piUsername: "test-pioneer",
  roles: ["buyer"],
  role: "buyer",
  settings: { theme: "light", language: "English", notifications: true },
};

const connectionFixture = () => ["store", "stream", "jobs"].map(serviceId => ({
  serviceId, connected: serviceId === "jobs", available: true, adapterMode: "connected",
}));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem("smaj_pi_user", JSON.stringify(value)), user);
  let task;
  const connections = connectionFixture();

  await page.route("**/user", route => route.fulfill({ json: { user } }));
  await page.route("**/ai/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/ai/tasks" && request.method() === "GET") {
      return route.fulfill({ json: { tasks: task ? [task] : [] } });
    }
    if (path === "/ai/connections" && request.method() === "GET") {
      return route.fulfill({ json: { connections } });
    }
    if (path === "/ai/tasks" && request.method() === "POST") {
      task = {
        id: "task-1",
        task: (await request.postDataJSON()).task,
        createdAt: new Date().toISOString(),
        plan: {
          model: "Meta AI",
          summary: "I can search current employer-backed jobs for you.",
          services: ["jobs"],
          steps: [{ serviceId: "jobs", title: "Search jobs", description: "Search verified employer listings.", status: "approval_required" }],
          proposedActions: [],
        },
      };
      return route.fulfill({ status: 201, json: { task, plan: task.plan } });
    }
    if (path === "/ai/tasks/task-1/discover" && request.method() === "POST") {
      task.plan.discovery = { results: [{ serviceId: "jobs", status: "read", records: [
        { id: "job-verified", title: "Verified engineer", company: "SMAJ", listingProvenance: "employer_backed", employerVerified: true },
        { id: "job-sample", title: "Example engineer", company: "Sample Co", listingProvenance: "sample", employerVerified: false },
      ] }] };
      task.plan.proposedActions = [{
        id: "action-1", serviceId: "jobs", recordId: "job-verified", kind: "apply", title: "Verified engineer",
        coverNote: "Please review my application.",
        applicationPreview: {
          job: { title: "Verified engineer", company: "SMAJ", location: "Remote", type: "Full-time", mode: "Remote", salary: "Competitive", category: "Engineering" },
          profile: { title: "Software engineer", skills: ["TypeScript"], location: "Remote", portfolio: "", summary: "", profilePhoto: "" },
          cv: { attached: true, name: "resume.pdf", size: 2048, visibility: "authorized" },
        },
      }];
      task.plan.actionReviewHash = "review-hash";
      return route.fulfill({ status: 200, json: { task, plan: task.plan } });
    }
    if (path === "/ai/tasks/task-1/approve" && request.method() === "POST") {
      task.plan.execution = { status: "running", events: [] };
      return route.fulfill({ status: 202, json: { task, plan: task.plan } });
    }
    if (path === "/ai/tasks/task-1" && request.method() === "GET") {
      task.plan.execution = { status: "verified", receipt: { verifiedAt: new Date().toISOString() }, events: [] };
      return route.fulfill({ status: 200, json: { task } });
    }
    if (path === "/ai/tasks/task-1/receipt/pdf") {
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 test receipt" });
    }
    if (path === "/ai/connections" && request.method() === "POST") {
      const body = await request.postDataJSON();
      const connection = connections.find(item => item.serviceId === body.serviceId);
      if (connection) connection.connected = body.connected;
      return route.fulfill({ status: 200, json: { connections } });
    }
    return route.fulfill({ status: 404, json: { message: `Unhandled mock API route: ${request.method()} ${path}` } });
  });
});

test("authenticated Pi workspace creates a task, approves discovery, preserves results and returns to Hub", async ({ page }) => {
  await page.goto("/ai");
  await expect(page.getByRole("heading", { name: "What can I help you do?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to SMAJ PI HUB" })).toBeVisible();
  await expect(page.locator(".private-header")).toBeHidden();

  await page.getByLabel("Your request").fill("Find verified engineering jobs");
  await page.getByRole("button", { name: /Ask SMAJ AI/ }).click();
  await expect(page.getByText("I can search current employer-backed jobs for you.")).toBeVisible();
  await page.getByRole("button", { name: "Approve search" }).click();
  await expect(page.locator(".embeddedAiCards").getByText("Verified engineer", { exact: true })).toBeVisible();
  await expect(page.getByText("Sample listing · Not verified")).toBeVisible();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve 1 selected actions" }).click();
  await expect(page.getByText("Task status · verified")).toBeVisible({ timeout: 8000 });
  const downloadWaiter = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF receipt" }).click();
  expect((await downloadWaiter).suggestedFilename()).toContain(".pdf");

  await page.getByRole("button", { name: "All Tasks" }).click();
  await expect(page.getByText("Find verified engineering jobs", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect Apps" }).click();
  const jobsConnection = page.locator(".embeddedAiConnections article").filter({ hasText: "SMAJ Jobs" });
  await jobsConnection.getByRole("button", { name: "Disconnect" }).click();
  await expect(jobsConnection.getByText("Not connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to SMAJ PI HUB" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("workspace content and service cards fit narrow mobile viewports", async ({ page }) => {
  await page.goto("/ai");
  await expect(page.getByRole("heading", { name: "What can I help you do?" })).toBeVisible();
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const { left, right, width } = element.getBoundingClientRect();
        return { left, right, width };
      };
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        header: rect(".embeddedAiHeader"),
        composer: rect(".embeddedAiComposer"),
      };
    });
    expect(dimensions.document, `document overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    for (const selector of ["header", "composer"]) {
      const bounds = dimensions[selector];
      expect(bounds, `${selector} missing at ${width}px`).not.toBeNull();
      expect(bounds.left, `${selector} starts outside viewport at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(bounds.right, `${selector} exceeds viewport at ${width}px`).toBeLessThanOrEqual(width);
    }
  }
  await page.getByRole("button", { name: "Connect Apps" }).click();
  await expect(page.getByRole("heading", { name: "Connect Apps" })).toBeVisible();
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const cards = await page.locator(".embeddedAiConnections article").evaluateAll(elements => elements.map(element => {
      const { left, right, width: cardWidth } = element.getBoundingClientRect();
      return { left, right, width: cardWidth };
    }));
    expect(cards.length, `service cards missing at ${width}px`).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.left, `service card starts outside viewport at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(card.right, `service card exceeds viewport at ${width}px`).toBeLessThanOrEqual(width);
    }
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `document overflow at ${width}px`).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button", { name: "Back to SMAJ PI HUB" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
