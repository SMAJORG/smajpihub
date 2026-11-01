import assert from "node:assert/strict";
import { confirmedSeller, withSellerEvidence } from "../services/publicSellerEvidence";
async function main(){
 const seller={uid:"seller",role:"seller",sellerActive:true,verificationStatus:"approved",verificationLevel:"seller_verified",displayName:"Seller",piUsername:"seller",country:"NG",contactPhone:"phone",avatar:"https://image.example/a",bio:"Business"};
 assert.equal(confirmedSeller(seller),true);
 for(const override of [{verificationStatus:"pending"},{verificationLevel:"pi_verified"},{avatar:""},{blocked:true},{role:"buyer",sellerActive:false}])assert.equal(confirmedSeller({...seller,...override}),false);
 const req={app:{locals:{userCollection:{find(){return {project(){return {async toArray(){return [seller,{...seller,uid:"unverified",verificationStatus:"pending"}];}};}};}}}}} as any;
 const rows=await withSellerEvidence(req,[{sellerId:"seller",sellerVerified:false,title:"Backend product"},{sellerId:"unverified",sellerVerified:true},{sellerId:"missing",sellerVerified:true}]);
 assert.deepEqual(rows.map(row=>row.sellerVerified),[true,false,false]);
 assert.equal((rows[0] as any).contactPhone,undefined);
 console.log("Seller evidence tests passed: current backend account and seller tier required; product snapshots cannot manufacture verification.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
