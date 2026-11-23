import { useEffect, useState } from 'react'
import {
  clearNativeLog,
  getNativeLog,
  nativeLogVisible,
  subscribeNativeLog,
} from '../lib/nativeLog'

/**
 * Registo do motor nativo, por cima do app: mostra o estado, o tempo, a duração e os
 * erros de cada troca de faixa. Só aparece dentro do APK; no navegador não é montado.
 */
export function NativeDebugLog() {
  const [open, setOpen] = useState(true)
  const [entries, setEntries] = useState(() => getNativeLog())

  useEffect(() => subscribeNativeLog(() => setEntries(getNativeLog())), [])

  if (!nativeLogVisible) return null

  return (
    <div className={`native-log${open ? ' is-open' : ''}`}>
      <div className="native-log-head">
        <button type="button" className="native-log-toggle" onClick={() => setOpen((value) => !value)}>
          {open ? 'Fechar registo' : 'Registo do player'}
        </button>
        {open && (
          <button type="button" className="native-log-clear" onClick={clearNativeLog}>
            Limpar
          </button>
        )}
      </div>
      {open && (
        <ol className="native-log-body">
          {entries.length === 0 && <li>Sem eventos. Toca uma música.</li>}
          {entries.map((entry) => (
            <li key={entry.id} className={`native-log-${entry.kind}`}>
              <span className="native-log-time">{entry.time}</span> {entry.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
