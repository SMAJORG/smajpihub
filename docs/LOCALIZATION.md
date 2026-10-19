# SMAJ PI HUB localization

## Architecture

The web frontend is React 19 / Vite with Capacitor Android. `mobile/` is a separate Expo / React Native application. Both consume the same ten committed UTF-8 catalogs in `frontend/src/locales/`: English (`en`), French (`fr`), Arabic (`ar`), Hausa (`ha`), Spanish (`es`), Portuguese (`pt`), Simplified Chinese (`zh`), Swahili (`sw`), Hindi (`hi`), and Turkish (`tr`).

The previous implementation had only English/French i18next resources. Its MutationObserver translated rendered DOM through four LibreTranslate servers, including user content, and cached missing provider output as successful originals. It did not supply actual resources for most selector languages. That observer has been removed.

`i18n.ts` initializes i18next / react-i18next synchronously with bundled resources. No model downloads or translation API calls occur for interface localization. Both selectors use one language list. Browser detection runs after an existing `smaj_language` preference; the selected language persists in localStorage, with an in-memory fallback when storage is blocked. `zh-CN`, `zh-Hans`, regional Arabic and Portuguese variants normalize to supported codes. Chinese uses Simplified translations. Arabic sets `html[dir=rtl]` on initial detection and subsequent switches.

The localized JSX runtime renders normal React DOM elements with translated text, placeholders, titles, alt text, and accessibility labels. It subscribes through react-i18next, so route elements, module-level label arrays, validation messages, and conditional buttons update without resetting application state. It keeps refs, keys, form values, event handlers and route/API identifiers intact. Options with implicit values retain their original submitted value. Interpolation templates preserve inserted user values. Existing public `nav`, `home` and `footer` keys remain compatible, including arrays.

The runtime adds no DOM wrappers. It does add a small React component per native DOM element. All ten catalogs are bundled upfront for immediate switching/offline use; this is a deliberate download-size tradeoff. Catalogs cover source interface literals and templates, not arbitrary server responses or user-authored content. Unknown messages remain original; add new source messages to the catalog when adding features.

`translate="no"`, `data-no-auto-translate`, code/pre, editable fields and the `originalContent()` boundary exclude content. The build-time `protect-content.cjs` transform protects direct known user-content expressions such as product titles, message bodies and usernames. **When adding a new API content shape, explicitly mark its display with `translate="no"`/`dir="auto"` or use `DynamicTranslation`.** Do not rely on catalog matching to identify arbitrary user data. Content that happens to equal a catalog entry can otherwise be localized. Never add raw user content to these catalogs.

The Expo app uses the same resources through localized Text/TextInput/View components and translated alert strings. Its account tab includes a language selector. It detects the system locale with Intl and persists a selection with existing SecureStore (localStorage on web). Direction and writing direction change through styles without forcing a native restart. Mark user content with the Text component's `original` prop. Capacitor uses the complete web implementation and localStorage in its WebView.

## Dynamic content

Product descriptions expose an explicit Translate / Show original action. `DynamicTranslation` calls the existing backend `/translations/batch` route. It cancels obsolete requests, imposes a client timeout and displays “Translation unavailable. Showing original text.” on failure. Raw content is rendered with `translate="no"` and `dir="auto"`. No frontend API keys exist.

Backend settings:

| Setting | Behavior |
| --- | --- |
| `TRANSLATION_API_URL` | Optional existing LibreTranslate-compatible provider, including scheme; empty disables dynamic translation |
| `TRANSLATION_API_KEY` | Optional server-only provider key |
| `TRANSLATION_API_URL_AR`, `_SW`, `_ZH` | Legacy overrides, only if deliberately configured; fall back to the primary URL |

`GET /translations/languages` returns `sourcesByTarget`, discovering `/languages` with a five-second timeout and ten-minute capability cache. Explicit pairs are checked before translation; auto-detection requires the provider to have a source that supports the target. Provider discovery is shared across targets. This API reports dynamic capabilities, independently of the ten interface languages.

`POST /translations/batch` accepts `{ texts: string[], source?: "auto" | languageCode, target: languageCode }`. Limits: 20 strings, 1,000 characters each, 30 requests/minute/client, two in-flight provider operations, eight-second translation timeout, bounded provider responses. Successful results are cached for five minutes with a 3,000-entry bound and source/target/provider/text-specific hashed keys. Secrets, provider errors and submitted text are not logged or returned. Native LibreTranslate `{translatedText: string[]}` and compatible `[{translatedText: string}]` outputs are supported.

Invalid input, unsupported pairs, unconfigured providers, timeouts, malformed/partial responses and unchanged output return non-success HTTP statuses with `status: "unavailable"` and a machine-readable `code`. No original-text success fallback is cached. An unchanged output may legitimately be a proper name or already in the target language; it is conservatively reported as unchanged rather than represented as a successful translation. No paid provider is introduced.

### Current provider limitations

All four existing `smajpihub-translate`, `-ar`, `-sw` and `-zh` Render `/languages` endpoints timed out during read-only verification. No live dynamic pair could be confirmed. The old backend only accepted French, Arabic, Swahili and Chinese targets; no reliable Hausa provider was configured. This implementation accepts all ten codes but only enables pairs actually advertised by a configured provider. With the optional provider unset, **all dynamic pairs are unavailable**, while all interface languages remain local. Hausa or any other language must not be promised until discovery confirms its source/target pair. Provider contract/failure behavior is tested with controlled responses independently of live availability.

## Render budget and migration

No deployment, plan change, service deletion or production-data action is part of this change.

`render.yaml` retains the existing service inventory to avoid deleting or disconnecting deployed services. These four model services are no longer dependencies of interface localization. They may still be selected as optional dynamic providers through existing environment variables, so confirm other consumers and owner approval before removing any deployed service.

`render.low-cost.yaml` is a **review-only proposal**: one Starter Node backend ($7/month base compute), existing free bot, static frontend hosting, zero translation/model servers. Auto-deploy is off in that proposal. Applying the paid Starter tier requires approval. The current backend already uses PM2 fork mode with one instance; there are no repository Gunicorn workers to reduce. Do not add Argos models to the 512 MB application instance.

Render lists Starter 512 MB compute at $7/month and free static hosting: [pricing](https://render.com/pricing), [static sites](https://render.com/docs/static-sites), [free-service limits](https://render.com/docs/free). Free web services share included hours and can sleep. The $7 proposal is a base-compute ceiling, **not a verified account-wide bill**: workspace subscriptions, bandwidth overages, storage, database billing and existing paid resources require account review. No hard account billing cap can be enforced by this source change. Use existing free/static frontend hosting and do not enable paid external translation APIs.

Owner migration checklist: review provider consumers and monthly account charges; approve the specific plan/configuration; clear legacy translation overrides if disabling providers; apply the chosen blueprint; verify authentication, payments, messages and the live capability endpoint; separately approve any legacy service deletion. Preserve existing database, auth, Supabase and application credentials.

## Catalog maintenance and validation

The initial expanded catalogs are machine translations of repository UI text and need native-speaker review, particularly Hausa and long legal/financial text. Brand names, identifiers, abbreviations and some borrowed words intentionally remain unchanged. Equal source/translation values alone do not demonstrate a missing translation. Source extraction is broad to cover label tables and runtime messages; some non-displayed constants are included. This change does not claim human-certified translation quality or exhaustive correctness of every possible backend response.

Run `node scripts/localization/extract.mjs` from the frontend directory to refresh English source and interpolation inventory. Review source changes, then author matching entries in each of the other nine JSON files. `generate.mjs` is an optional one-time machine-authoring helper using a public translation endpoint; it sends repository messages only, requires network access, offers no SLA, and is never imported at runtime. It is not the production dynamic provider. `finalize.mjs` checks placeholder parity and removes obsolete keys; it does not fill missing entries with English. Always run catalog tests after any editing.

Validation commands:

```sh
cd frontend
node --test tests/localization.test.mjs
npm run test:jobs
npm run build
npm run build:android-web
cd ../backend
node --test tests/translations.test.cjs
npm run build
cd ..
npm run mobile:typecheck
npm run mobile:test:oauth
```

Browser checks should cover all ten selector options, repeated switching back to English, refresh persistence, Arabic on initial load, desktop and 390px mobile widths, an open form retaining its values, navigation, translated accessibility labels, and dynamic failure messaging. A physical Android device / signed APK and authenticated production workflows still require device/account validation; a web build alone cannot certify them.
