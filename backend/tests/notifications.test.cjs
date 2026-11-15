const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { createMemoryCollections } = require('../build/services/memoryDatabase');
const { createNotification } = require('../build/services/notifications');
const push = require('../build/services/pushNotifications');

test('action notifications resolve MongoDB recipients to Pi UIDs and deliver to the same owner', async () => {
  const locals = createMemoryCollections();
  const id = new ObjectId();
  await locals.userCollection.insertOne({ _id: id, uid: 'verified-mainnet-owner' });
  const delivered = [];
  const original = push.sendPushNotification;
  push.sendPushNotification = async (_app, uid) => delivered.push(uid);
  try {
    const input = { userId: id.toString(), type: 'education_lesson_request', title: 'Lesson request', message: 'New request' };
    await createNotification({ locals }, input);
    await createNotification({ locals }, { ...input, userId: 'other-pi-uid', type: 'new_message' });
    await createNotification({ locals }, { ...input, userId: new ObjectId().toString() });
    const notifications = await locals.notificationCollection.find({}).toArray();
    assert.equal(notifications.length, 2);
    assert.deepEqual(notifications.map(item => item.userId), ['verified-mainnet-owner', 'other-pi-uid']);
    assert.deepEqual(delivered, ['verified-mainnet-owner', 'other-pi-uid']);
    assert(notifications.every(item => item.read === false && item.createdAt instanceof Date));
    assert.equal(input.userId, id.toString());
  } finally { push.sendPushNotification = original; }
});
