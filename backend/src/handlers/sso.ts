import { Router } from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import { resolveCurrentUser } from "../services/auth";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const settings = () => {
  const clientId = process.env.SMAJ_AI_CLIENT_ID?.trim() || "smaj-ai";
  const clientSecret = process.env.SMAJ_AI_CLIENT_SECRET?.trim() || "";
  const signingSecret = process.env.SMAJ_AI_SSO_SECRET?.trim() || clientSecret;
  const redirectUri = process.env.SMAJ_AI_REDIRECT_URI?.trim() || (process.env.SMAJ_AI_BACKEND_URL ? `${process.env.SMAJ_AI_BACKEND_URL.replace(/\/+$/, "")}/api/auth/callback` : "");
  const frontend = (process.env.SMAJ_HUB_PUBLIC_URL?.trim() || "https://smajpihub.com").replace(/\/+$/, "");
  if (clientSecret.length < 32 || signingSecret.length < 32 || !redirectUri || new URL(redirectUri).protocol !== "https:" || new URL(frontend).protocol !== "https:") throw new Error("SSO is not configured");
  return {clientId, clientSecret, signingSecret, redirectUri, frontend};
};
const approvedRequest = (value: any, config: ReturnType<typeof settings>) => value?.client_id === config.clientId && value?.redirect_uri === config.redirectUri && typeof value.state === "string" && /^[a-zA-Z0-9_-]{32,128}$/.test(value.state) && value.scope === "profile:read jobs:read store:read";

export default function mountSsoEndpoints(router: Router) {
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");next();});
  router.get("/authorize", (req,res)=>{
    try {
      const config = settings();
      if (!approvedRequest(req.query,config)) return res.status(400).json({message:"Invalid SMAJ AI sign-in request."});
      const target = new URL("/ai/sign-in",config.frontend);
      for (const name of ["client_id","redirect_uri","state","scope"]) target.searchParams.set(name,String(req.query[name]));
      return res.redirect(302,target.toString());
    } catch { return res.status(503).json({message:"SMAJ AI single sign-on is not configured."}); }
  });
  router.post("/authorize", async (req,res)=>{
    try {
      const config = settings();
      const allowedOrigins = new Set([new URL(config.frontend).origin,...(process.env.FRONTEND_URL || "").split(",").map(v=>v.trim()).filter(Boolean)]);
      if (!allowedOrigins.has(req.get("origin") || "")) return res.status(403).json({message:"Sign in from SMAJ PI HUB."});
      if (!approvedRequest(req.body,config)) return res.status(400).json({message:"Invalid SMAJ AI sign-in request."});
      const user = await resolveCurrentUser(req);
      if (!user) return res.status(401).json({message:"Sign in with Pi to continue to SMAJ AI."});
      const codes = req.app.locals.ssoCodeCollection;
      if (!codes) return res.status(503).json({message:"Sign-in storage is temporarily unavailable."});
      const code = randomBytes(32).toString("base64url");
      await codes.insertOne({_id:digest(code),clientId:config.clientId,redirectUri:config.redirectUri,userId:user._id.toString(),expiresAt:new Date(Date.now()+60000)});
      const target = new URL(config.redirectUri);target.searchParams.set("code",code);target.searchParams.set("state",req.body.state);
      return res.json({redirectUrl:target.toString()});
    } catch { return res.status(503).json({message:"SMAJ AI sign-in is temporarily unavailable."}); }
  });
  router.post("/token", async (req,res)=>{
    try {
      const config = settings();
      const body=req.body;
      if (body?.grant_type!=="authorization_code"||body.client_id!==config.clientId||typeof body.client_secret!=="string"||!equal(digest(body.client_secret),digest(config.clientSecret))||body.redirect_uri!==config.redirectUri||typeof body.code!=="string"||!/^[a-zA-Z0-9_-]{43}$/.test(body.code)) return res.status(401).json({error:"invalid_grant"});
      const codes=req.app.locals.ssoCodeCollection;
      if (!codes) return res.status(503).json({error:"authentication_unavailable"});
      const stored=await codes.findOneAndDelete({_id:digest(body.code),clientId:config.clientId,redirectUri:config.redirectUri,expiresAt:{$gt:new Date()}});
      if (!stored||!ObjectId.isValid(stored.userId)) return res.status(401).json({error:"invalid_grant"});
      const user=await req.app.locals.userCollection.findOne({_id:new ObjectId(stored.userId)});
      if (!user||user.blocked) return res.status(401).json({error:"invalid_grant"});
      const header=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
      const payload=Buffer.from(JSON.stringify({sub:user._id.toString(),uid:user.uid,piUsername:user.piUsername,iss:"smajpihub",aud:config.clientId,scope:"profile:read jobs:read store:read",exp:Math.floor(Date.now()/1000)+60})).toString("base64url");
      const signature=createHmac("sha256",config.signingSecret).update(`${header}.${payload}`).digest("base64url");
      return res.json({access_token:`${header}.${payload}.${signature}`,token_type:"Bearer",expires_in:60});
    } catch { return res.status(503).json({error:"authentication_unavailable"}); }
  });
}
