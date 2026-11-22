import { BACKGROUNDS, useBackground } from '../lib/backgrounds'
import { BackgroundScene } from '../components/BackgroundScene'
import { CheckIcon, SparkleIcon } from '../components/Icons'
import { cx } from '../lib/format'

export function Backgrounds() {
  const [active, setActive] = useBackground()

  return (
    <div>
      <h1 className="page-title">Fundos</h1>
      <p className="page-sub">
        Escolhe um fundo animado para a app. Fica guardado neste dispositivo e aparece logo.
      </p>

      <div className="bg-grid">
        {BACKGROUNDS.map((background) => {
          const selected = active === background.id
          return (
            <button
              key={background.id}
              type="button"
              className={cx('bg-card', selected && 'is-active')}
              onClick={() => setActive(background.id)}
              aria-pressed={selected}
            >
              <span className="bg-thumb">
                {background.id === 'none' ? (
                  <span className="bg-thumb-none" />
                ) : (
                  <BackgroundScene id={background.id} preview />
                )}
                {selected && (
                  <span className="bg-check">
                    <CheckIcon size={15} />
                  </span>
                )}
              </span>
              <span className="bg-card-text">
                <strong>{background.name}</strong>
                <small>{background.note}</small>
              </span>
            </button>
          )
        })}
      </div>

      <p className="page-footer">
        <SparkleIcon size={14} /> Os fundos param sozinhos se o telemóvel pedir menos animações.
      </p>
    </div>
  )
}
