import type { Request } from "express";
import { ObjectId } from "mongodb";

export function confirmedSeller(user: any): boolean {
  const complete=user?.role==="admin"||Boolean(user?.displayName&&user?.piUsername&&user?.country&&user?.contactPhone&&user?.avatar&&user?.bio);
  const seller=user?.sellerActive===true||user?.role==="seller"||user?.role==="admin";
  return !user?.blocked&&user?.status!=="blocked"&&user?.verificationStatus==="approved"&&complete&&seller&&["seller_verified","trusted_seller"].includes(user?.verificationLevel);
}
export async function withSellerEvidence(req: Request, products: Record<string,any>[]) {
  const ids=[...new Set(products.map(product=>String(product.sellerId||"")).filter(Boolean))];
  if(!ids.length)return products.map(product=>({...product,sellerVerified:false}));
  const users=await req.app.locals.userCollection.find({$or:[{uid:{$in:ids}},{_id:{$in:ids.filter(ObjectId.isValid).map(id=>new ObjectId(id))}}]}).project({uid:1,role:1,sellerActive:1,verificationStatus:1,verificationLevel:1,displayName:1,piUsername:1,country:1,contactPhone:1,avatar:1,bio:1}).toArray();
  const verified=new Map<string,boolean>();
  for(const user of users){if(user.uid)verified.set(String(user.uid),confirmedSeller(user));if(user._id)verified.set(String(user._id),confirmedSeller(user));}
  return products.map(product=>({...product,sellerVerified:verified.get(String(product.sellerId||""))===true}));
}
