import { useEffect, useState } from 'react'
import {
  clearNativeLog,
  getNativeLog,
  nativeLogVisible,
  subscribeNativeLog,
} from '../lib/nativeLog'

/**
 * Registo do motor nativo, dentro das Definições: mostra o estado, o tempo, a duração e
 * os erros de cada troca de faixa. Só existe dentro do APK; no navegador não é montado.
 */
export function NativeDebugLog() {
  const [entries, setEntries] = useState(() => getNativeLog())

  useEffect(() => subscribeNativeLog(() => setEntries(getNativeLog())), [])

  if (!nativeLogVisible) return null

  return (
    <div className="native-log">
      <div className="native-log-head">
        <span>{entries.length} evento(s)</span>
        <button type="button" className="native-log-clear" onClick={clearNativeLog}>
          Limpar
        </button>
      </div>
      <ol className="native-log-body">
        {entries.length === 0 && <li>Sem eventos. Toca uma música e volta aqui.</li>}
        {entries.map((entry) => (
          <li key={entry.id} className={`native-log-${entry.kind}`}>
            <span className="native-log-time">{entry.time}</span> {entry.text}
          </li>
        ))}
      </ol>
    </div>
  )
}
