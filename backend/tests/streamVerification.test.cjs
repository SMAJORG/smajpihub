const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ObjectId } = require('mongodb');
const { MemoryCollection } = require('../build/services/memoryDatabase');
const mountStream = require('../build/handlers/stream').default;
const { verificationStatuses } = require('../build/services/smajVerification');

test('public Stream channels expose the real owner ID used by the shared verification badge', async () => {
  const ownerId = new ObjectId();
  const users = new MemoryCollection();
  await users.insertOne({ _id: ownerId, uid: 'channel-owner', username: 'pioneer', role: 'seller', verificationLevel: 'trusted_seller', smajVerification: { status: 'approved' }, accessToken: 'private-token', streamProfile: { channelHandle: 'pioneer', channelName: 'Pioneer channel', creatorId: 'forged-profile-id' } });
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.session = {}; next(); });
  Object.assign(app.locals, { userCollection: users, streamContentCollection: new MemoryCollection(), streamPostCollection: new MemoryCollection() });
  const router = express.Router(); mountStream(router); app.use('/stream', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/stream/channels/pioneer`);
    assert.equal(response.status, 200);
    const channel = await response.json();
    assert.equal(channel.creatorId, ownerId.toString());
    assert.equal(channel.channel.name, 'Pioneer channel');
    assert(!JSON.stringify(channel).includes('private-token'));
    const approved = await verificationStatuses(users, [channel.creatorId]);
    assert.equal(approved[channel.creatorId].level, 'trusted_seller');
    await users.updateOne({ _id: ownerId }, { $set: { smajVerification: { status: 'revoked' } } });
    assert.equal((await verificationStatuses(users, [channel.creatorId]))[channel.creatorId].verified, false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
