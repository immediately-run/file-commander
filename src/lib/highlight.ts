// file commander — tiny syntax highlighter for the file viewer (F3).
// Returns an HTML string consumed via dangerouslySetInnerHTML; the .tk-* spans
// are styled in App.css from the Monokai-ish --syn-* tokens.

export function highlight(src: string, name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = esc(src);
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
    out = out
      .replace(/(\/\/[^\n]*)/g, '<span class="tk-com">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|"[^"]*"|'[^']*'|`[^`]*`)/g, '<span class="tk-str">$1</span>')
      .replace(/\b(import|from|export|default|const|let|return|function|new|await|async|type|as)\b/g, '<span class="tk-key">$1</span>')
      .replace(/\b([A-Z][A-Za-z0-9]+)\b/g, '<span class="tk-const">$1</span>');
  } else if (ext === 'md') {
    out = out.replace(/^(#+ .*)$/gm, '<span class="tk-key">$1</span>').replace(/(- .*)$/gm, '<span class="tk-fn">$1</span>');
  } else if (ext === 'css') {
    out = out.replace(/(\/\*[^]*?\*\/)/g, '<span class="tk-com">$1</span>').replace(/(--[a-z-]+)/g, '<span class="tk-const">$1</span>');
  } else if (ext === 'json') {
    out = out.replace(/(&quot;[^&]*?&quot;|"[^"]*")/g, '<span class="tk-str">$1</span>');
  }
  return out;
}
