import css from './Badge.module.scss'

type BadgeProps = {
  // The meaning is always in the text. The tone only changes the look.
  tone?: 'neutral' | 'reserved' | 'sold'
  children: React.ReactNode
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return <span className={`${css.badge} ${css[tone]}`}>{children}</span>
}
