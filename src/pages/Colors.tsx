import { ACCENTS, useAccent } from '../lib/theme'
import { CheckIcon, SparkleIcon } from '../components/Icons'
import { cx } from '../lib/format'

export function Colors() {
  const [active, setActive] = useAccent()

  return (
    <div>
      <h1 className="page-title">Cores do tema</h1>
      <p className="page-sub">
        A cor dos botões, das barras de progresso e dos destaques. Muda logo e fica guardada.
      </p>

      <div className="accent-grid">
        {ACCENTS.map((accent) => {
          const selected = active === accent.id
          return (
            <button
              key={accent.id}
              type="button"
              className={cx('accent-card', selected && 'is-active')}
              onClick={() => setActive(accent.id)}
              aria-pressed={selected}
              style={selected ? { borderColor: accent.color } : undefined}
            >
              <span className="accent-dot" style={{ background: accent.color }} />
              <span className="accent-name">{accent.name}</span>
              {selected && (
                <span className="accent-check" style={{ background: accent.color }}>
                  <CheckIcon size={14} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="page-footer">
        <SparkleIcon size={14} /> Combina bem com qualquer um dos fundos animados.
      </p>
    </div>
  )
}
