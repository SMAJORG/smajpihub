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
    <div id="dynamic"><DynamicTranslation text="A private product description." source="en" /></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
