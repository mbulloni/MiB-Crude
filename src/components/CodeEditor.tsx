// Monaco wrapper for PHP event code and SQL.
import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

(self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };

const PHP_HELPERS = ['db()', 'user()', 'userId()', 'userName()', 'isAdmin()', 'userGroups()', 'sendMail($to, $subject, $body)', 'redirect($url)', 't($key)', 'h($s)', 'appUrl($page, $params)', 'sessionVar($key, $value)'];
let registered = false;
function registerCompletions() {
  if (registered) return;
  registered = true;
  monaco.languages.registerCompletionItemProvider('php', {
    provideCompletionItems: (model, pos) => {
      const w = model.getWordUntilPosition(pos);
      const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
      const items: monaco.languages.CompletionItem[] = PHP_HELPERS.map((h) => ({ label: h.replace(/\(.*/, ''), kind: monaco.languages.CompletionItemKind.Function, insertText: h, detail: 'MiB-Crude', range }));
      items.push(
        { label: 'db()->all', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "db()->all('SELECT * FROM ${1:tabella} WHERE ${2:id} = ?', [${3:\\$id}])", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Query → array di righe', range },
        { label: 'db()->row', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "db()->row('SELECT * FROM ${1:tabella} WHERE ${2:id} = ?', [${3:\\$id}])", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Query → una riga', range },
        { label: 'db()->value', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "db()->value('SELECT COUNT(*) FROM ${1:tabella}')", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Query → valore', range },
        { label: 'db()->insert', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "db()->insert('${1:tabella}', ['${2:campo}' => ${3:\\$valore}])", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Inserisce una riga', range },
        { label: 'db()->update', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "db()->update('${1:tabella}', ['${2:campo}' => ${3:\\$valore}], ['id' => ${4:\\$id}])", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Aggiorna righe', range },
      );
      return { suggestions: items };
    },
  });
}

export function applyMonacoTheme(dark: boolean) { monaco.editor.setTheme(dark ? 'vs-dark' : 'vs'); }

export default function CodeEditor({ value, onChange, language = 'php', height = 320, readOnly, marker }: { value: string; onChange: (v: string) => void; language?: string; height?: number | string; readOnly?: boolean; marker?: { line: number; message: string } | null }) {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    registerCompletions();
    const e = monaco.editor.create(host.current!, {
      value, language, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, readOnly,
      theme: document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'vs', tabSize: 4,
    });
    e.onDidChangeModelContent(() => cb.current(e.getValue()));
    ed.current = e;
    return () => { e.getModel()?.dispose(); e.dispose(); };
  }, [language]);
  useEffect(() => { const e = ed.current; if (e && e.getValue() !== value) e.setValue(value); }, [value]);
  useEffect(() => { ed.current?.updateOptions({ readOnly }); }, [readOnly]);
  useEffect(() => {
    const m = ed.current?.getModel();
    if (!m) return;
    monaco.editor.setModelMarkers(m, 'lint', marker ? [{ startLineNumber: marker.line, endLineNumber: marker.line, startColumn: 1, endColumn: 200, message: marker.message, severity: monaco.MarkerSeverity.Error }] : []);
  }, [marker]);
  return <div className="code" style={{ height }} ref={host} />;
}
