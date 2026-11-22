import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/components/AmbassadorServicesPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const cropMarkup = component.slice(component.indexOf("{cropEditor ?"), component.indexOf("{selfieCameraOpen ?"));

assert.match(component, /useLayoutEffect\(\(\) => \{[\s\S]*drawIdCrop\(context, canvas\.width, canvas\.height, cropEditor\)/);
assert.match(component, /return Math\.min\(width \/ bounds\.width, height \/ bounds\.height\)/);
assert.match(component, /const initialCropRect =/);
assert.match(component, /const resizeCropRect =/);
assert.match(component, /const handleSize =/);
assert.doesNotMatch(component, /cropEditor\.zoom|ambassador-crop-zoom|type="range"/);
assert.match(cropMarkup, /onMouseDown=\{event => \{[\s\S]*event\.stopPropagation\(\)/);
assert.match(cropMarkup, /onClick=\{event => event\.stopPropagation\(\)\}/);
assert.doesNotMatch(cropMarkup, /type="submit"/);
assert.match(cropMarkup, /type="button" onClick=.*Rotate left/s);
assert.match(cropMarkup, /type="button" onClick=.*Rotate right/s);
assert.match(cropMarkup, /type="button" className="primary" onClick=.*Confirm crop/s);
assert.match(component, /await uploadIdentityImage\(field, croppedImage\)/);
assert.match(component, /uploadErrors\[field\]/);
assert.match(component, /Recrop \{label\}/);
assert.match(component, /onPointerDown=\{startCropDrag\} onPointerMove=\{moveCrop\}/);
assert.match(styles, /\.ambassador-crop-canvas \{[^}]*touch-action: none/);
assert.doesNotMatch(styles, /ambassador-crop-zoom/);

console.log("Ambassador ID crop tests passed.");
