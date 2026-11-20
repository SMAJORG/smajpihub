// Run in your own terminal. Do not commit or share the generated output.
const { randomBytes, scryptSync } = require('node:crypto');
const password = randomBytes(32).toString('base64url');
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64).toString('hex');
console.log('Save this password in your password manager, then use it on the Testnet admin sign-in page:');
console.log(password);
console.log('\nSet this SERVER-ONLY Render variable:');
console.log('PI_TESTNET_ADMIN_PASSWORD_HASH=scrypt$' + salt.toString('hex') + '$' + hash);
