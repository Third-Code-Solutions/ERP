import { CORTEX_TYPE_LABEL } from './href'

export interface CortexAgentContext {
  refTable: string
  refId: string
  nodeType: string
  title: string | null
}

export function cortexAgentContextsMatch(
  left: CortexAgentContext | null,
  right: CortexAgentContext | null
): boolean {
  if (!left || !right) return left === right
  return left.refTable === right.refTable && left.refId === right.refId
}

export function cortexAgentContextHref(
  context: CortexAgentContext | null,
  conversationId?: string
): string {
  const params = new URLSearchParams()
  if (context) {
    params.set('refTable', context.refTable)
    params.set('refId', context.refId)
  }
  if (conversationId) params.set('conversationId', conversationId)
  const query = params.toString()
  return query ? `/cortex?${query}` : '/cortex'
}

export function cortexConversationUrl(
  currentUrl: string,
  conversationId: string | null
): string {
  const url = new URL(currentUrl, 'https://local.invalid')
  if (conversationId) url.searchParams.set('conversationId', conversationId)
  else url.searchParams.delete('conversationId')
  return `${url.pathname}${url.search}${url.hash}`
}

function humanize(value: string): string {
  const text = value.replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Record'
}

export function cortexAgentContextLabel(
  context: CortexAgentContext
): string {
  const typeLabel =
    CORTEX_TYPE_LABEL[context.nodeType] ?? humanize(context.nodeType)
  return context.title ? `${context.title} · ${typeLabel}` : typeLabel
}
