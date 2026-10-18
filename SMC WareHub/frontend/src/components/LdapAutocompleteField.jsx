import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useT } from '../i18n';

export function LdapAutocompleteField({ value, disabled, searchPath, emptyText, onChange, onSelect }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const boxRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!open) return undefined;
    const query = valueRef.current.trim();
    if (query.length < 2) { setResults(null); setError(''); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get(searchPath, { q: query })
        .then((res) => { if (!cancelled) { setResults(res.results); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [value, open, searchPath]);

  useEffect(() => {
    function onOutside(event) { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div className="loan-borrower-field" ref={boxRef}>
      <input
        className="form-control"
        value={value}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
      />
      {open && value.trim().length >= 2 && (
        <div className="loan-borrower-suggest">
          {error && <div className="hv-error">{error}</div>}
          {!error && results === null && <div className="loan-borrower-suggest-empty">{t('common.loading')}</div>}
          {!error && results && results.length === 0 && <div className="loan-borrower-suggest-empty">{emptyText}</div>}
          {results && results.map((match) => (
            <button
              type="button"
              key={match.username}
              className="loan-borrower-suggest-row"
              onClick={() => { onSelect(match); setOpen(false); }}
            >
              <b>{match.full_name}</b>
              <small>{[match.employee_id, match.username, match.department].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
