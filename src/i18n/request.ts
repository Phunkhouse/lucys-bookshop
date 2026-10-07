import { notFound } from 'next/navigation'
import { locale as getRootLocale } from 'next/root-params'
import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const rootLocale = await getRootLocale()
    if (!hasLocale(routing.locales, rootLocale)) notFound()
    locale = rootLocale
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
