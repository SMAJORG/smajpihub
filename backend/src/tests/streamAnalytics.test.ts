import assert from "node:assert/strict";
import { createMemoryCollections } from "../services/memoryDatabase";
import { getStreamPlaybackTotals, recordStreamPlayback } from "../services/streamAnalytics";

const main = async () => {
  const collection = createMemoryCollections().streamPlaybackSessionCollection;
  const start = new Date("2026-10-07T00:00:00Z");
  const event = { creatorId: "creator", videoId: "video", viewerId: "viewer", sessionId: "session-1", watchSeconds: 0 };
  assert.deepEqual(await getStreamPlaybackTotals(collection, "creator"), { views: 0, watchSeconds: 0 });
  await recordStreamPlayback(collection, event, start);
  await recordStreamPlayback(collection, { ...event, watchSeconds: 10 }, new Date(+start + 10_000));
  await recordStreamPlayback(collection, { ...event, watchSeconds: 10 }, new Date(+start + 11_000));
  await recordStreamPlayback(collection, { ...event, watchSeconds: 5 }, new Date(+start + 12_000));
  assert.deepEqual(await getStreamPlaybackTotals(collection, "creator"), { views: 1, watchSeconds: 10 }, "Retries and older checkpoints must not double count or lower totals");
  await recordStreamPlayback(collection, { ...event, watchSeconds: 5000 }, new Date(+start + 13_000));
  assert.deepEqual(await getStreamPlaybackTotals(collection, "creator"), { views: 1, watchSeconds: 15 }, "Seeking or forged checkpoints cannot exceed elapsed session time");
  await recordStreamPlayback(collection, { ...event, sessionId: "session-2" }, start);
  await recordStreamPlayback(collection, { ...event, creatorId: "other", videoId: "other-video" }, start);
  assert.deepEqual(await getStreamPlaybackTotals(collection, "creator"), { views: 2, watchSeconds: 15 });
  assert.deepEqual(await getStreamPlaybackTotals(collection, "other"), { views: 1, watchSeconds: 0 });
  console.log("Stream analytics regression checks passed");
};
void main().catch(error => { console.error(error); process.exitCode = 1; });
