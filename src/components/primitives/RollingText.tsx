import s from './primitives.module.css'

/**
 * §10.1 Rolling text — label duplicated in a clipped container; the stack
 * translates −50% (one label height) on host hover. Used on EVERY link/button.
 * Screen readers get the label once.
 */
export function RollingText({ children, className }: { children: string; className?: string }) {
  return (
    <span className={`${s.roll} ${className ?? ''}`}>
      <span className="visually-hidden">{children}</span>
      <span className={s.rollStack} aria-hidden="true">
        <span>{children}</span>
        <span>{children}</span>
      </span>
    </span>
  )
}

/** §10.3 Arrow shift — diagonal exit / entry. */
export function Arrow({ className }: { className?: string }) {
  const path = <path d="M3 13 13 3M5.5 3H13v7.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
  return (
    <span className={`${s.arrow} ${className ?? ''}`} aria-hidden="true">
      <svg viewBox="0 0 16 16">{path}</svg>
      <svg viewBox="0 0 16 16">{path}</svg>
    </span>
  )
}

export const primitiveClass = s
