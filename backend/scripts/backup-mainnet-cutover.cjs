// Run from a trusted operator environment, never an HTTP endpoint or build step.
// Requires MongoDB Database Tools and secrets injected through the environment.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { MongoClient } = require('mongodb');

const run = async () => {
  const uri = process.env.MONGODB_URI;
  const database = process.env.MONGODB_DATABASE_NAME || 'smajpihub';
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '', 'base64');
  if (!uri || key.length !== 32 || process.env.BACKUP_WRITES_QUIESCED !== 'true') throw new Error('Inject MONGODB_URI, a base64 32-byte BACKUP_ENCRYPTION_KEY and BACKUP_WRITES_QUIESCED=true after pausing application writes.');
  if (!/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error('Invalid backup database name');
  const directory = path.resolve(process.env.BACKUP_DIRECTORY || '.private-backups');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-backup-'));
  const config = path.join(temp, 'tools.yml');
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const archive = path.join(directory, `${database}-${id}.archive.gz.aes`);
  const iv = crypto.randomBytes(12);
  const client = new MongoClient(uri);
  const tool = (name, args) => {
    const child = spawn(name, [`--config=${config}`, ...args], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    // Tools can include credentials in diagnostic errors. Never forward stderr.
    child.stderr.resume();
    const done = new Promise((resolve, reject) => { child.once('error', () => reject(new Error(`${name} could not start; install MongoDB Database Tools`))); child.once('close', code => code === 0 ? resolve() : reject(new Error(`${name} failed; inspect privately on the operator host`))); });
    return { child, done };
  };
  try {
    fs.writeFileSync(config, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600, flag: 'wx' });
    await client.connect();
    const db = client.db(database);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const inventory = [];
    for (const { name } of collections) inventory.push({ name, count: await db.collection(name).countDocuments(), indexes: (await db.collection(name).indexes()).map(index => ({ name: index.name, key: index.key, unique: Boolean(index.unique) })) });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const dump = tool('mongodump', [`--db=${database}`, '--archive', '--gzip']);
    dump.child.stdin.end();
    await Promise.all([dump.done, pipeline(dump.child.stdout, cipher, fs.createWriteStream(archive, { mode: 0o600, flags: 'wx' }))]);
    const authTag = cipher.getAuthTag();
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
    const sha256 = hash.digest('hex');
    // Restore into a new isolated namespace. No --drop; originals are never a target.
    const restoredDatabase = `${database}_restorecheck_${crypto.randomBytes(6).toString('hex')}`;
    const restore = tool('mongorestore', ['--archive', '--gzip', `--nsInclude=${database}.*`, `--nsFrom=${database}.*`, `--nsTo=${restoredDatabase}.*`]);
    restore.child.stdout.resume();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    // Save recovery metadata before restore so a failed verification does not lose the backup.
    const receipt = { database, archive: path.basename(archive), createdAt: new Date().toISOString(), encryption: 'aes-256-gcm', iv: iv.toString('base64'), authTag: authTag.toString('base64'), sha256, restoredDatabase, restoreVerified: false, inventory };
    const receiptFile = `${archive}.json`;
    fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
    await Promise.all([restore.done, pipeline(fs.createReadStream(archive), decipher, restore.child.stdin)]);
    for (const expected of inventory) {
      const collection = client.db(restoredDatabase).collection(expected.name);
      if (await collection.countDocuments() !== expected.count) throw new Error('Restore document counts differ; keep cutover disabled');
      const indexes = await collection.indexes();
      for (const index of expected.indexes) if (!indexes.some(actual => actual.name === index.name && JSON.stringify(actual.key) === JSON.stringify(index.key) && Boolean(actual.unique) === index.unique)) throw new Error('Restored indexes differ; keep cutover disabled');
    }
    receipt.restoreVerified = true;
    fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ backup: archive, receipt: receiptFile, sha256, restoreVerified: true, restoredDatabase }));
  } finally {
    await client.close();
    key.fill(0);
    // Only the explicitly created credential file is removed, without recursion.
    if (fs.existsSync(config)) fs.unlinkSync(config);
    fs.rmdirSync(temp);
  }
};
run().catch(() => { console.error('Backup or isolated restore verification failed. Production cutover must remain disabled. No original data was deleted. Check required tooling, protected environment settings and database permissions privately.'); process.exitCode = 1; });
