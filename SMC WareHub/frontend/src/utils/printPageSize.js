const STYLE_ID = 'dynamic-page-size';

export function setPrintPageSize(css) {
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@page { ${css} }`;
}

export const HANDOVER_PAGE_CSS = 'size: A4 portrait; margin: 0;';

export function labelPageCss(kho) {
  return kho === '24' ? 'size: 60mm 24mm; margin: 0;' : 'size: 30mm 12mm; margin: 0;';
}

export function printWithBodyClass(className, onDone) {
  const cleanup = () => {
    document.body.classList.remove(className);
    window.removeEventListener('afterprint', cleanup);
    onDone?.();
  };
  document.body.classList.add(className);
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function printHandoverSheets(onDone) {
  setPrintPageSize(HANDOVER_PAGE_CSS);
  printWithBodyClass('printing-handover', onDone);
}
