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
  context: CortexAgentContext | null
): string {
  if (!context) return '/cortex'
  return `/cortex?refTable=${encodeURIComponent(context.refTable)}&refId=${encodeURIComponent(context.refId)}`
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
