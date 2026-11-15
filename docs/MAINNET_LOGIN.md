# Mainnet login fixes

Normal visits to smajpihub.com and www.smajpihub.com initialize the Pi SDK with
Sandbox disabled, even if an old deployment supplied a Sandbox build flag.
Actual Sandbox frames and Testnet development domains keep their existing behavior.
No Testnet configuration, payment settings or unrelated services are changed.

Login resolves a token-verified Pi UID through a verified identity binding to the
original MongoDB account. Its original UID, username, profile, verification,
roles and historical ownership remain intact. New users still use normal Pi
registration; a colliding username cannot authorize access or create a duplicate.

Existing users with a valid saved SMAJ Hub session can connect a new Mainnet Pi
identity from `/account-link` using **Verify with my existing SMAJ session**.
This requires an explicitly supplied signed Hub access token, an active device
record and a fresh Pi `/v2/me` proof. Cookies, client UIDs and usernames cannot
substitute for either proof. Users review the original account before confirming.
The device is checked again transactionally at completion; revocation or expiry
prevents linking. No administrator review or visit to Testnet is needed for this
method. The verified binding persists, so later Mainnet sign-ins use normal login.

A repeated completion for the same consumed challenge, same incoming Pi UID and
same confirmed original UID returns success without another write. Other replays
and rebinding attempts still fail. This prevents a lost success response from
being reported as a new identity conflict.

Limitation: users without a valid original SMAJ session or another existing
ownership proof cannot be mapped automatically. Pi does not document an API
mapping the two app-specific UIDs. These changes do not invent such a mapping,
create accounts for conflicted identities, or establish any production mapping
without the user's ownership proof.
