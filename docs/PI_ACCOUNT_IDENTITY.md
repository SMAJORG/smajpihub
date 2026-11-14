# Pi login rollback

The original direct-UID Pi login and session lookup are restored. The backend verifies the token through Pi `/v2/me`, loads the saved MongoDB user by that verified UID, and issues the existing Hub session. Saved profile fields, roles, verification, seller state and account history are preserved. The original SDK Sandbox selection and Pages build setting are restored from the version before the identity changes.

Account-recovery resolvers, continuity hints, cross-UID session migration, recovery login warnings, recovery endpoints, screens and navigation have been removed. Existing recovery/identity documents in MongoDB are left untouched and are no longer consulted by login. No database migration, deletion, reset or automatic account linking is performed.

Pi authentication remains mandatory. A known username with an unknown verified UID cannot authorize the saved account or provision a duplicate; it uses the existing generic Pi login failure response. Genuine new users can register normally. Backend-confirmed account data remains required; failures do not fabricate a local account. Existing Testnet payout fixes and unrelated services are retained.

The existing read-only account audit script remains available for offline investigation. Source rollback does not verify deployment or production-user login.
