type BadgeProps = {
  children: React.ReactNode
}

export function Badge({ children }: BadgeProps) {
  return <span>{children}</span>
}
