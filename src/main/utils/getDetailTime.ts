export type DetailTimeInput = Date | string | number | null | undefined

export type DetailTimeOptions = {
  includeWeekday?: boolean
  includeSeconds?: boolean
  includeTimezone?: boolean
  fallback?: string
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const padTwoDigits = (value: number): string => String(value).padStart(2, '0')

const toDate = (input: DetailTimeInput): Date | null => {
  if (input == null || input === '') {
    return null
  }
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

const getLocalTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

export const getDetailTime = (
  input: DetailTimeInput = new Date(),
  options: DetailTimeOptions = {}
): string => {
  const date = toDate(input)
  if (!date) {
    return options.fallback ?? (typeof input === 'string' ? input : '')
  }

  const includeWeekday = options.includeWeekday ?? true
  const includeSeconds = options.includeSeconds ?? true
  const includeTimezone = options.includeTimezone ?? true
  const dateText =
    `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())} ` +
    `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}` +
    `${includeSeconds ? `:${padTwoDigits(date.getSeconds())}` : ''}`
  const weekdayText = includeWeekday ? ` ${WEEKDAYS[date.getDay()]}` : ''
  const timezoneText = includeTimezone ? `（时区：${getLocalTimezone()}）` : ''

  return `${dateText}${weekdayText}${timezoneText}`
}

export const getCurrentDetailTime = (options?: DetailTimeOptions): string =>
  getDetailTime(new Date(), options)

export const getFrontendMessageTime = (input: DetailTimeInput): string => {
  const date = toDate(input)
  if (!date) return typeof input === 'string' ? input : ''
  return `${padTwoDigits(date.getMonth() + 1)}/${padTwoDigits(date.getDate())} ${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`
}

export const getFrontendDetailTime = (input: DetailTimeInput): string => {
  const date = toDate(input)
  if (!date) return typeof input === 'string' ? input : ''
  return (
    `${padTwoDigits(date.getMonth() + 1)}/${padTwoDigits(date.getDate())} ` +
    `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}:${padTwoDigits(date.getSeconds())}`
  )
}
