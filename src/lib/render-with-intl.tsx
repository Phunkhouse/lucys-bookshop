import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../messages/cs.json'

// Component tests only: renders with the real Czech messages.
export function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="cs" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}
