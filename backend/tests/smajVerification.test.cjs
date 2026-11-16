const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ObjectId } = require('mongodb');
const { createMemoryCollections } = require('../build/services/memoryDatabase');
const { smajVerification, verificationStatuses } = require('../build/services/smajVerification');
const mountVerification = require('../build/handlers/users').default;
const mountAdmin = require('../build/handlers/admin').default;

test('identity approval is independent of Pi authentication, roles and service approvals', () => {
  const user = { _id: new ObjectId(), uid: 'pi-verified', role: 'seller', piVerifiedUid: 'pi-verified', verified: true };
  assert.equal(smajVerification(user).verified, false);
  assert.equal(smajVerification({ ...user, role: 'admin', verificationStatus: 'approved', verificationLevel: 'trusted_seller' }).verified, false);
  assert.equal(smajVerification({ ...user, verificationStatus: 'approved', verificationLevel: 'pi_verified' }).verified, true);
  for (const level of ['pi_verified', 'seller_verified', 'trusted_seller']) {
    assert.equal(smajVerification({ ...user, verificationLevel: level, smajVerification: { status: 'approved' } }).level, level);
    assert.equal(smajVerification({ ...user, verificationLevel: level, smajVerification: { status: 'revoked' } }).level, null);
  }
  for (const status of ['pending', 'rejected', 'suspended', 'revoked', 'expired', 'none']) {
    assert.equal(smajVerification({ ...user, verificationStatus: 'approved', verificationLevel: 'pi_verified', smajVerification: { status } }).verified, false);
  }
  const approved = { ...user, smajVerification: { status: 'approved', expiresAt: new Date(2000), revision: 3 } };
  assert.equal(smajVerification(approved, 1000).verified, true);
  assert.equal(smajVerification(approved, 2000).status, 'expired');
  assert.equal(smajVerification({ ...approved, blocked: true }, 1000).status, 'suspended');
  assert.equal(smajVerification({ ...approved, smajVerification: { status: 'approved', expiresAt: 'bad-date' } }).verified, false);
});

test('batch lookups match only account IDs or exact UIDs and expose no private evidence', async () => {
  const locals = createMemoryCollections();
  const id = new ObjectId();
  await locals.userCollection.insertOne({ _id: id, uid: 'verified-uid', username: 'not-an-identifier', verificationStatus: 'approved', verificationLevel: 'pi_verified', accessToken: 'secret', email: 'private@example.com' });
  const results = await verificationStatuses(locals.userCollection, ['verified-uid', id.toString(), 'not-an-identifier']);
  assert.equal(results['verified-uid'].userId, id.toString());
  assert.equal(results[id.toString()].verified, true);
  assert.equal(results['not-an-identifier'].verified, false);
  assert(!JSON.stringify(results).includes('secret'));
  assert(!JSON.stringify(results).includes('private@example.com'));
});

test('only admins review identities; approval, suspension, expiration and revocation use one audited account record', async () => {
  const locals = createMemoryCollections();
  const admin = new ObjectId(), buyer = new ObjectId();
  await locals.userCollection.insertOne({ _id: admin, uid: 'review-admin', role: 'admin' });
  await locals.userCollection.insertOne({ _id: buyer, uid: 'review-target', role: 'buyer' });
  const app = express(); Object.assign(app.locals, locals); app.use(express.json());
  app.use((req, _res, next) => { req.session = { cookie: {}, save: callback => callback(), user: req.get('x-test-user') ? { userId: req.get('x-test-user') } : undefined }; next(); });
  const publicRouter = express.Router(); mountVerification(publicRouter); app.use('/user', publicRouter);
  const adminRouter = express.Router(); mountAdmin(adminRouter); app.use('/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const patch = (body, actor = admin) => fetch(`${base}/admin/users/${buyer}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(actor ? { 'x-test-user': actor.toString() } : {}) }, body: JSON.stringify(body) });
  const status = async () => (await verificationStatuses(locals.userCollection, ['review-target']))['review-target'];
  try {
    assert.equal((await patch({ smajVerificationStatus: 'approved' }, null)).status, 401);
    assert.equal((await patch({ smajVerificationStatus: 'approved' }, buyer)).status, 403);
    assert.equal((await patch({ verificationLevel: 'seller_verified' })).status, 200);
    assert.equal((await status()).verified, false);
    assert.equal((await patch({ smajVerificationStatus: 'approved', verificationExpiresAt: 'bad-date' })).status, 400);
    assert.equal((await patch({ smajVerificationStatus: 'approved', expectedVerificationRevision: 0 })).status, 200);
    assert.equal((await status()).verified, true);
    assert.equal((await status()).level, 'seller_verified');
    assert.equal((await patch({ verificationLevel: 'trusted_seller' })).status, 200);
    assert.equal((await status()).level, 'trusted_seller');
    assert.equal((await patch({ smajVerificationStatus: 'revoked', expectedVerificationRevision: 0 })).status, 409);
    assert.equal((await patch({ smajVerificationStatus: 'suspended' })).status, 200);
    assert.equal((await status()).verified, false);
    assert.equal((await patch({ smajVerificationStatus: 'approved', verificationExpiresAt: new Date(Date.now() + 150).toISOString() })).status, 200);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal((await status()).status, 'expired');
    assert.equal((await patch({ smajVerificationStatus: 'revoked' })).status, 200);
    assert.equal((await status()).status, 'revoked');
    const selfEdit = await fetch(`${base}/user/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-user': buyer.toString() }, body: JSON.stringify({ displayName: 'Updated safely', smajVerification: { status: 'approved' }, verificationStatus: 'approved', verificationLevel: 'trusted_seller' }) });
    assert.equal(selfEdit.status, 200);
    assert.equal((await status()).status, 'revoked');
    const stored = await locals.userCollection.findOne({ _id: buyer });
    assert.equal(stored.smajVerificationHistory.length, 4);
    assert.equal(stored.smajVerification.reviewedBy, admin.toString());
    assert.equal(stored.uid, 'review-target');
    assert.equal(stored.role, 'buyer');
    const response = await fetch(`${base}/user/verification-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: ['review-target'] }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).statuses['review-target'].status, 'revoked');
    const invalid = await fetch(`${base}/user/verification-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: Array(101).fill('target') }) });
    assert.equal(invalid.status, 400);
    assert.equal((await patch({ verificationLevel: 'basic', smajVerificationStatus: 'approved', verificationExpiresAt: null })).status, 200);
    assert.equal((await status()).verified, true);
    assert.equal((await locals.userCollection.findOne({ _id: buyer })).verificationLevel, 'pi_verified');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
