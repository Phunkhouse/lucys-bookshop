import { qrMatrix } from './qr-matrix'

type QrCodeProps = {
  value: string
  // The text alternative, for assistive technology.
  label: string
  className?: string
}

// Modules of white around the code, which scanners need (QR standard: 4).
const QUIET_ZONE = 4

// Drawn as plain SVG shapes from the module matrix: no markup is built from
// text, and it works with no script in the browser. Always black on white,
// whatever the page theme, because scanners need the contrast.
export function QrCode({ value, label, className }: QrCodeProps) {
  const matrix = qrMatrix(value)
  const size = matrix.length + QUIET_ZONE * 2

  const squares: string[] = []
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) squares.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`)
    }),
  )

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={squares.join('')} fill="#000" />
    </svg>
  )
}
