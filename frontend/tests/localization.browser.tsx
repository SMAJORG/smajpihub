import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/i18n';
import '../src/localization/rtl.css';
import LanguageSoonButton from '../src/components/LanguageSoonButton';
import DynamicTranslation from '../src/components/DynamicTranslation';

function Fixture() {
  const [value, setValue] = useState('');
  return <main style={{ maxWidth: 400, margin: 'auto', padding: 12 }}>
    <LanguageSoonButton />
    <h1>Settings</h1>
    <label>Search<input id="preserved-input" placeholder="Search" value={value} onChange={event => setValue(event.target.value)} /></label>
    <button id="sample-button" title="Save" type="button">Save</button>
    <p id="original" translate="no">Save</p>
    <section id="localized-card" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <h2>Start Your Business</h2>
      <strong id="localized-count">{1234}</strong>
      <p id="localized-price">$1,299.00</p>
      <svg id="direction-icon" data-testid="ArrowForwardOutlinedIcon" aria-hidden="true" width="24" height="24"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
    </section>
    <div id="dynamic"><DynamicTranslation text="A private product description." source="en" /></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
