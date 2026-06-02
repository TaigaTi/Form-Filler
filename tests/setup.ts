// jsdom 24 does not implement the CSS interface, so `CSS.escape` — a standard
// global in real Chrome that fieldExtractor/content use to escape page-controlled
// id/name values — is undefined under test. Install a WHATWG-spec escape so the
// suite exercises the same code path the extension uses in the browser. Real
// Chrome provides the native one; this only fills the jsdom gap.
if (typeof (globalThis as any).CSS === 'undefined' || typeof (globalThis as any).CSS?.escape !== 'function') {
  (globalThis as any).CSS = {
    ...(globalThis as any).CSS,
    escape(value: string): string {
      // Per https://drafts.csswg.org/cssom/#serialize-an-identifier — sufficient
      // for the characters we guard against (e.g. " and \ in id/name values).
      const str = String(value);
      let result = '';
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        const ch = str[i];
        if (
          (c >= 0x30 && c <= 0x39) || // 0-9
          (c >= 0x41 && c <= 0x5a) || // A-Z
          (c >= 0x61 && c <= 0x7a) || // a-z
          c === 0x2d || // -
          c === 0x5f || // _
          c >= 0x80 // non-ASCII
        ) {
          result += ch;
        } else {
          result += '\\' + ch;
        }
      }
      return result;
    },
  };
}
