# CareRoute frontend validation

Run from `frontend`:

```sh
npm run test:careroute
npm run test:careroute:browser
npm run build
```

The browser suite mounts the actual CareRoute pages with the hub's global CSS and
localization runtime. It mocks API responses; it never changes a real hospital or
patient request. It covers responsive widths, missing ETA data, active/history
grouping, patient access restrictions, disconnected tracking and confirmation
before hospital actions. Windows uses the installed Microsoft Edge browser.

The state tests cover staff-session display guards, failed-write visibility,
offline mutations and empty server history overriding stale local records.

## Access and synchronization boundaries

Hospital UI access requires a successful response from the existing hospital
staff login endpoint. A Pi patient login alone, legacy fabricated staff state and
the previous demo shortcut no longer open the operational workspace. Existing
staff must sign in once after this change. API authorization must still be
enforced by the backend: the frontend session marker is only a display guard and
does not secure API endpoints. This redesign does not alter backend authorization.

The existing local cache, optimistic writes, broadcast events and polling remain
in place. A transport observer displays read/write failures even when a service
falls back to cached data. A successful read does not clear a failed write. No
page describes the connection as live; the UI shows the last server contact.
Hospital matching and emergency dispatch logic are unchanged.

## White paper alignment

Sections 7.1 and 10.1 of `By_smaj_pi_hub_white_paper_v2.md` describe a shared Pi
identity across hub services. CareRoute has no independent logout control and
does not invoke the hub's global sign-out. Account sessions remain managed by
SMAJ PI HUB.

Section 7.4 requires provider verification for sensitive services. Hospital
staff verification is retained through the existing backend endpoint; ordinary
Pi patient access never automatically grants clinical operations permissions.
Linking hospital permissions directly to Pi identity would require backend
support and is not introduced by this frontend change.
