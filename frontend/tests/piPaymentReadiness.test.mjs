import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('../src/lib/piPaymentReadiness.ts',import.meta.url),'utf8').replace('import { axiosClient } from "./axiosClient";','const axiosClient=globalThis.__paymentClient;');
const compiled=transformSync(source,{loader:'ts',format:'esm',define:{'import.meta.env.VITE_PI_PAYMENTS_ENABLED':'globalThis.__paymentFlag'}}).code;
let calls=0,data={};globalThis.__paymentClient={get:async()=>{calls++;return{data};}};
const {assertPiPaymentsReady}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('unapproved release never starts a payment request; server must separately approve the Mainnet network',async()=>{
 globalThis.__paymentFlag='false';await assert.rejects(assertPiPaymentsReady(),/awaiting Pi approval/);assert.equal(calls,0);
 globalThis.__paymentFlag='true';
 for(const status of [{status:'ok',paymentsEnabled:false,paymentNetwork:'Pi Network'},{status:'ok',paymentsEnabled:true,paymentNetwork:'Pi Testnet'},{status:'unavailable',paymentsEnabled:true,paymentNetwork:'Pi Network'}]){data=status;await assert.rejects(assertPiPaymentsReady(),/not enabled/);}
 data={status:'ok',paymentsEnabled:true,paymentNetwork:'Pi Network'};await assertPiPaymentsReady();
});
