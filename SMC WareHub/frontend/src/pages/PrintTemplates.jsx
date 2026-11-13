import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { useT } from '../i18n';
import { usePrintLabels, PrintLabelsContext } from '../context/PrintLabelsContext';
import { DEFAULT_PRINT_LABELS, PRINT_LABEL_SECTIONS, MOCK_LOAN_DATA, MOCK_HANDOVER_DATA } from '../utils/printLabels';
import { LoanSheet } from '../components/LoanSheet';
import { HandoverSheet } from '../components/HandoverSheet';

function ImportModal({ onClose, onImported }) {
  const { t } = useT();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.postFile('/print-labels/import', formData);
      setResult(res);
      setFile(null);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop">
      <div className="modal-card" style={{ width: 'min(520px, calc(100vw - 32px))' }}>
        <div className="modal-header">
          <h2 className="modal-title">{t('printTpl.importTitle')}</h2>
          <button type="button" className="btn-close" aria-label={t('common.close')} onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '4px 26px 20px' }}>
          <p className="field-hint">{t('printTpl.importHelp')}</p>
          <a className="field-hint" href="/samples/print-labels-sample.xlsx" download>{t('printTpl.importSample')}</a>
          <form onSubmit={handleSubmit}>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginTop: 10 }} />
            {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
            {result && <div className="hv-note" style={{ marginTop: 10 }}>{t('printTpl.importDone', { imported: result.imported })}</div>}
            <div className="modal-actions modal-footer" style={{ marginTop: 16 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
              <button type="submit" className="btn-primary" disabled={!file || busy}>
                {busy ? t('printTpl.importing') : t('printTpl.importSubmit')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PrintTemplates() {
  const { t } = useT();
  const { overrides, refresh } = usePrintLabels();
  const [activeSheet, setActiveSheet] = useState(PRINT_LABEL_SECTIONS[0].sheet);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const sheet = PRINT_LABEL_SECTIONS.find((s) => s.sheet === activeSheet);

  function valueOf(key) {
    if (Object.prototype.hasOwnProperty.call(edits, key)) return edits[key] ?? DEFAULT_PRINT_LABELS[key] ?? '';
    return overrides[key] ?? DEFAULT_PRINT_LABELS[key] ?? '';
  }
  function isOverridden(key) {
    return Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] !== null : Object.prototype.hasOwnProperty.call(overrides, key);
  }
  function handleChange(key, value) {
    setEdits((current) => ({ ...current, [key]: value }));
  }
  function handleReset(key) {
    setEdits((current) => ({ ...current, [key]: null }));
  }

  const dirtyCount = Object.keys(edits).length;

  async function handleSave() {
    setError(''); setNotice(''); setBusy(true);
    try {
      await api.put('/print-labels', edits);
      await refresh();
      setEdits({});
      setNotice(t('printTpl.saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const previewContextValue = useMemo(() => ({ overrides: {}, label: valueOf, refresh: async () => {} }), [edits, overrides]);

  return (
    <div>
      <div className="page-head">
        <h2>{t('printTpl.title')}</h2>
        <div className="row-actions">
          <button className="btn-secondary" onClick={() => setImportOpen(true)}>{t('printTpl.importTitle')}</button>
          {dirtyCount > 0 && <button className="btn-secondary" onClick={() => setEdits({})}>{t('printTpl.discard')}</button>}
          <button className="btn-primary" onClick={handleSave} disabled={busy || dirtyCount === 0}>
            {busy ? t('printTpl.saving') : t('printTpl.saveN', { count: dirtyCount })}
          </button>
        </div>
      </div>
      <p className="field-hint">{t('printTpl.help')}</p>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="hv-note">{notice}</div>}

      <div className="ptpl-tabs">
        {PRINT_LABEL_SECTIONS.map((s) => (
          <button
            type="button"
            key={s.sheet}
            className={`ptpl-tab${activeSheet === s.sheet ? ' active' : ''}`}
            onClick={() => setActiveSheet(s.sheet)}
          >
            {s.sheetTitle}
          </button>
        ))}
      </div>

      <div className="ptpl-layout">
        <div className="ptpl-fields">
          {sheet.sections.map((section) => (
            <div className="ptpl-section" key={section.title}>
              <h3 className="ptpl-section-title">{section.title}</h3>
              {section.fields.map(({ key, label }) => (
                <div className="ptpl-field" key={key}>
                  <div className="ptpl-field-head">
                    <span className="ptpl-field-label">{label}</span>
                    {isOverridden(key) && (
                      <button type="button" className="ptpl-field-reset" onClick={() => handleReset(key)}>{t('printTpl.resetDefault')}</button>
                    )}
                  </div>
                  <textarea
                    className="form-control ptpl-field-input"
                    rows={DEFAULT_PRINT_LABELS[key].includes('\n') ? 5 : 1}
                    value={valueOf(key)}
                    onChange={(e) => handleChange(key, e.target.value)}
                  />
                  <span className="ptpl-field-key">{key}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="ptpl-preview">
          <div className="hv-preview">
            <PrintLabelsContext.Provider value={previewContextValue}>
              {activeSheet === 'loan'
                ? <LoanSheet no="2611001" data={MOCK_LOAN_DATA} />
                : <HandoverSheet data={MOCK_HANDOVER_DATA} />}
            </PrintLabelsContext.Provider>
          </div>
        </div>
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImported={refresh} />}
    </div>
  );
}
