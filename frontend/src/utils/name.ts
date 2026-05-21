export function lastName(name: string | null | undefined): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] ?? name
}

export function firstNames(name: string | null | undefined): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? parts.slice(0, -1).join(' ') : ''
}

export function fmtName(name: string | null | undefined): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
}
