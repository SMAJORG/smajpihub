import assert from "node:assert/strict";
import express from "express";
import {ObjectId} from "mongodb";
import {createHash,createHmac} from "crypto";
import mountSsoEndpoints from "../handlers/sso";
import * as auth from "../services/auth";
async function main(){
 const old={...process.env},resolve=auth.resolveCurrentUser;
 process.env.SMAJ_AI_CLIENT_ID="smaj-ai";process.env.SMAJ_AI_CLIENT_SECRET="test-client-secret-with-at-least-32-characters";process.env.SMAJ_AI_SSO_SECRET="test-signing-secret-with-at-least-32-characters";process.env.SMAJ_AI_BACKEND_URL="https://ai.example";process.env.SMAJ_HUB_PUBLIC_URL="https://hub.example";delete process.env.SMAJ_AI_REDIRECT_URI;
 const id=new ObjectId();let verified:any=null,blocked=false;const rows=new Map<string,any>();
 (auth as any).resolveCurrentUser=async()=>verified;
 const app=express();app.use(express.json());app.locals.userCollection={findOne:async()=>({_id:id,uid:"verified-pi-user",piUsername:"verified",blocked})};
 app.locals.ssoCodeCollection={insertOne:async(row:any)=>{rows.set(row._id,row);},findOneAndDelete:async(q:any)=>{const row=rows.get(q._id);if(!row||row.expiresAt<=q.expiresAt.$gt||row.clientId!==q.clientId||row.redirectUri!==q.redirectUri)return null;rows.delete(q._id);return row;}};
 const router=express.Router();mountSsoEndpoints(router);app.use("/sso",router);const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as any).port}/sso`;
 const body={client_id:"smaj-ai",redirect_uri:"https://ai.example/api/auth/callback",state:"A".repeat(43),scope:"profile:read jobs:read store:read"};
 const post=(path:string,value:any,origin="https://hub.example")=>fetch(base+path,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(value)});
 try{
  const front=await fetch(base+"/authorize?"+new URLSearchParams(body),{redirect:"manual"});assert.equal(front.status,302);assert.equal(new URL(front.headers.get("location")!).pathname,"/ai/sign-in");
  assert.equal((await post("/authorize",body)).status,401);assert.equal(rows.size,0);verified={_id:id,uid:"verified-pi-user"};
  assert.equal((await post("/authorize",body,"https://evil.example")).status,403);assert.equal((await post("/authorize",{...body,redirect_uri:"https://evil.example/callback"})).status,400);
  const response=await post("/authorize",body);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
  const destination=new URL((await response.json()).redirectUrl);const code=destination.searchParams.get("code")!;assert.equal(destination.searchParams.get("state"),body.state);assert.equal(rows.has(code),false);assert.equal(rows.has(createHash("sha256").update(code).digest("hex")),true);
  const exchange={grant_type:"authorization_code",client_id:body.client_id,redirect_uri:body.redirect_uri,client_secret:process.env.SMAJ_AI_CLIENT_SECRET,code};
  assert.equal((await post("/token",{...exchange,client_secret:"incorrect"})).status,401);assert.equal(rows.size,1);
  const exchanged=await post("/token",exchange);assert.equal(exchanged.status,200);const token=(await exchanged.json()).access_token;const [h,p,s]=token.split(".");assert.equal(s,createHmac("sha256",process.env.SMAJ_AI_SSO_SECRET!).update(`${h}.${p}`).digest("base64url"));const claims=JSON.parse(Buffer.from(p,"base64url").toString());assert.equal(claims.sub,id.toString());assert.equal(claims.scope,body.scope);assert.ok(claims.exp*1000-Date.now()<=60000);assert.equal(claims.accessToken,undefined);assert.equal((await post("/token",exchange)).status,401);
  const next=new URL((await (await post("/authorize",body)).json()).redirectUrl);const expired=next.searchParams.get("code")!;rows.get(createHash("sha256").update(expired).digest("hex"))!.expiresAt=new Date(0);assert.equal((await post("/token",{...exchange,code:expired})).status,401);
  const third=new URL((await (await post("/authorize",body)).json()).redirectUrl);blocked=true;assert.equal((await post("/token",{...exchange,code:third.searchParams.get("code")})).status,401);
  delete process.env.SMAJ_AI_CLIENT_SECRET;assert.equal((await post("/authorize",body)).status,503);
  console.log("Hub SSO: verified identity, origin, exact callback, confidential client, expiring one-time codes, blocked users and credential isolation passed");
 }finally{server.close();(auth as any).resolveCurrentUser=resolve;process.env=old;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
