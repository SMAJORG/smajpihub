# SMAJ Verified identity

The authoritative record is `users.smajVerification` on the existing MongoDB
user ID. In fresh Mainnet mode the same code uses `mainnet_users`; it never
copies Testnet accounts or verification to an unrelated Mainnet identity.

`services/smajVerification.ts` computes the public decision. Approved legacy
account records remain usable until reviewed. The legacy automatic administrator
login seed is excluded unless an account verification request/review is recorded.
Pi authentication, administrator roles, seller permissions, product approval,
Jobs company/candidate checks, tutor qualifications and hospital/institution
approval cannot grant the identity badge.

Administrators review accounts through the existing User accounts panel.
Approval, pending, rejection, suspension, expiration and revocation write the
record and append the reviewer ID, time, reason, expiry and revision to
`smajVerificationHistory` in the same atomic user update. A revision check rejects
competing/stale reviews. Existing legacy administrator verification-status API
calls feed this same record; changing a seller tier alone does not approve identity.
Public profile updates do not accept this record.

`POST /user/verification-status` accepts up to 100 exact Pi UIDs or MongoDB user
IDs and returns only public status, canonical account ID, expiry and revision.
It never looks up usernames or returns review evidence, credentials or contact
information. Blocked, unknown and ambiguous identities have no badge. Expiration
is computed on every read, so no scheduled job is required for correctness.

`SmajVerifiedBadge` is the shared identity component. Its compatibility export
`TrustBadge` accepts a user ID only; product snapshot fields cannot render it.
The server-approved account level selects the indicator color: Pi Verified blue,
Seller Verified purple, or Trusted Seller gold. Stream channels, creator cards,
subscriptions and search results use the channel owner's MongoDB account ID.
Visible identities share batched requests, refresh every 15 seconds and on resume,
and invalidate immediately after an administrator update in the same browser.
Local expiry timers remove expired badges without waiting for polling. Failed
status reads hide badges; verification is never loaded from offline caches.
Separate clients observe an administrator change on their next refresh, within
15 seconds while visible. Badges are informational and grant no permissions.

Health badges apply only to authenticated SMAJ user identities. Patient names,
browser-local hospital staff records and unlinked provider records must never
be treated as verified SMAJ users. The existing Mainnet Health release gate stays
in force.

Validation: backend tests cover authorization, legacy compatibility, exact account
matching, response privacy, stale reviews, blocking, expiry and revocation.
Browser tests cover the shared badge and real administrator panel at 390px and
820px in light/dark themes, including failure states, menus and dialogs.
