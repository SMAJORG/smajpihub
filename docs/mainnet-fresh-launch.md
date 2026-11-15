SMAJ PI HUB fresh Mainnet launch
==============================

Production uses the existing MongoDB database with every application collection
scoped to `mainnet_`, including users, sessions, messages, profiles, Jobs, Health,
Education and Store. Original unprefixed Testnet collections remain untouched.
Mainnet usernames cannot collide with Testnet registrations. No identities or roles
are imported. Incoming Pi tokens are verified server-side with `/v2/me`.

Backend launch settings (merge into the existing service; retain its secrets):

```
PI_COMMERCE_MODE=mainnet
PI_MAINNET_ACCOUNT_MODE=fresh
PI_NETWORK=Pi Network
PI_PAYMENTS_ENABLED=false
PLATFORM_API_URL=https://api.minepi.com
```

Keep the established administrator's Pi username in the protected
`ADMIN_PI_USERNAMES` configuration. Admin access still requires Pi authentication.
No original Testnet account or role is opened by the new login.

Public website and APK builds set `VITE_SANDBOX_SDK=false` and
`VITE_PI_PAYMENTS_ENABLED=false`. Android uses the existing Pi Browser bridge,
random state validation and exact callback URLs. Ordinary browsers hand off to
Pi Browser. Users approve their own Pi authentication; automated API tests mock
Pi and cannot prove that a particular Developer Portal app is approved.

Real payments remain disabled in both clients and server. Before enabling them,
verify the Mainnet app/domain in Pi Developer Portal, configure the protected
`PI_MAINNET_APP_ID` and `PI_MAINNET_API_KEY`, obtain app/payment permissions and
incoming-wallet approval, and record `PI_MAINNET_INCOMING_WALLET_APPROVED=true`.
The existing payment activation guard additionally requires a backup checksum and
verified isolated restore. Rebuild clients only after server approval/completion,
amount, payer, network, metadata and replay checks pass against approved Mainnet.
Do not use Testnet API keys or wallet secrets for Mainnet.

Release acceptance: actual Pi Browser approval → fresh profile → repeat login to
the same MongoDB ID; signed APK install/update → Pi Browser → validated app
callback; Store/Jobs/Education/Health navigation and authorization; no payment SDK
dialog or server money movement while disabled. These require real device/provider
verification before declaring production readiness.

Health emergency matching, dispatch and private request queues are disabled in
fresh Mainnet mode. The legacy module contains demo availability and lacks the
provider authorization needed for real medical operations. The public directory
returns no hospitals; it does not auto-seed demo capacity. Verified provider
onboarding, ownership checks and actual dispatch integration are release blockers
for that service. Do not enable it by removing the guard alone.
