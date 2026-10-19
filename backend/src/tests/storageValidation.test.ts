import assert from "assert";
import axios from "axios";

const base64Png = "data:image/png;base64,iVBORw0KGgo=";

const main = async () => {
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  process.env.CLOUDINARY_UPLOAD_PRESET = "unsigned";

  const imageStorage = await import("../services/imageStorage");
  const auth = await import("../services/auth");

  assert.equal(imageStorage.isBase64Image(base64Png), true);
  assert.equal(imageStorage.isBase64Image("https://res.cloudinary.com/demo/image/upload/sample.png"), false);
  assert.equal(imageStorage.sanitizeAssetName("bad/name\\with spaces?.png"), "bad-name-with-spaces-.png");

  const originalFetch = global.fetch;
  let savedBody = "";
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    savedBody = init?.body?.toString() || "";
    return {
      ok: true,
      json: async () => ({ secure_url: "https://res.cloudinary.com/demo/image/upload/v1/product.jpg", public_id: "product" }),
    } as Response;
  }) as typeof fetch;

  const uploaded = await imageStorage.resolveImageValue(base64Png, "product/gallery", "slash/name.png");
  assert.equal(uploaded, "https://res.cloudinary.com/demo/image/upload/v1/product.jpg");
  assert.equal(savedBody.includes("file=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgo%3D"), true);
  assert.equal(savedBody.includes("filename_override=slash-name.png"), true);
  assert.equal(savedBody.includes("display_name="), false);
  assert.equal(savedBody.includes("folder="), false);
  assert.equal(savedBody.includes("public_id="), false);

  global.fetch = (async () => ({ ok: false, text: async () => "nope" }) as Response) as typeof fetch;
  await assert.rejects(() => imageStorage.resolveImageValue(base64Png, "avatar", "avatar"), /Cloudinary upload failed/);

  assert.throws(
    () => imageStorage.assertNoBase64Images({ image: base64Png }, "product"),
    /Base64 images cannot be stored in MongoDB/,
  );

  const sessionUser = auth.minimalSessionUser({
    _id: { toString: () => "user-object-id" },
    piUsername: "seller",
    role: "seller",
  });
  assert.deepEqual(sessionUser, { userId: "user-object-id", piUsername: "seller", role: "seller" });
  assert.equal(auth.minimalSessionUser({ _id: "id", uid: "pi-uid", role: "buyer" }).uid, "pi-uid");
  assert.equal("uid" in auth.minimalSessionUser({ _id: "id", uid: null }), false);

  const originalAdapter = axios.defaults.adapter;
  let verifiedUid = "pi-uid";
  axios.defaults.adapter = async config => {
    assert.equal(config.url, "/v2/me");
    assert.equal(config.headers.Authorization, "Bearer token-123");
    return { data: { uid: verifiedUid }, status: 200, statusText: "OK", headers: {}, config };
  };

  const request: any = {
    session: {},
    get: (header: string) => header.toLowerCase() === "authorization" ? "Bearer token-123" : "",
    app: {
      locals: {
        userCollection: {
          findOne: async () => ({
            _id: { toString: () => "user-object-id" },
            uid: "pi-uid",
            username: "seller",
            piUsername: "seller",
            role: "seller",
            blocked: false,
          }),
        },
      },
    },
  };
  const resolvedUser = await auth.resolveCurrentUser(request);
  assert.equal(resolvedUser?.uid, "pi-uid");
  assert.equal(request.session.user, undefined);
  verifiedUid = "different-user";
  assert.equal(await auth.resolveCurrentUser({ ...request, session: {} }), null);
  axios.defaults.adapter = originalAdapter;

  global.fetch = originalFetch;
  console.log("storage validation tests passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
