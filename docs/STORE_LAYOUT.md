# Store header and RTL layout

The store now displays only the selected hero slide, keeping banner visibility
independent of document direction. Broken banner images leave readable copy on
a gradient fallback. Reduced-motion preferences disable automatic rotation.

Mobile header spacing, the cart badge and category drawer use logical edges.
Search suggestions isolate product names from translated labels. Filter popovers
anchor to the full mobile filter row so all four menus stay inside the viewport.
The benefits strip scrolls without duplicating or moving its content offscreen.
The category drawer supports Escape, focus containment and focus restoration;
its inactive panel is inert.

Run from `frontend`:

```sh
node node_modules/@playwright/test/cli.js test --config tests/store.playwright.config.ts
npm run test:i18n
npm run build
```

The browser suite mounts the real StorePage under the application styles and
auth provider with test-only API fixtures. It checks English and Arabic at 320,
390, 768 and 1440 pixels, search values, all filters, all banner positions with
failed images, and both drawer panels. The Store layout checks workflow runs
the browser suite, interface tests and production build without deployment.

These changes preserve catalog APIs, authentication, cart, filters and checkout.
They do not translate user product names or words embedded in uploaded images.
