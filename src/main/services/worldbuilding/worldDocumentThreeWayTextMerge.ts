type TextEdit = { start: number; end: number; lines: string[] }

const editsFromBase = (base: string[], target: string[]): TextEdit[] | null => {
  if (base.length * target.length > 300_000) return null
  const width = target.length + 1
  const cells = new Uint32Array((base.length + 1) * width)
  for (let left = base.length - 1; left >= 0; left -= 1) {
    for (let right = target.length - 1; right >= 0; right -= 1) {
      cells[left * width + right] =
        base[left] === target[right]
          ? cells[(left + 1) * width + right + 1] + 1
          : Math.max(cells[(left + 1) * width + right], cells[left * width + right + 1])
    }
  }
  const edits: TextEdit[] = []
  let left = 0
  let right = 0
  let pending: TextEdit | null = null
  const flush = () => {
    if (pending) edits.push(pending)
    pending = null
  }
  while (left < base.length || right < target.length) {
    if (left < base.length && right < target.length && base[left] === target[right]) {
      flush()
      left += 1
      right += 1
      continue
    }
    pending ??= { start: left, end: left, lines: [] }
    if (
      right < target.length &&
      (left >= base.length || cells[left * width + right + 1] > cells[(left + 1) * width + right])
    ) {
      pending.lines.push(target[right])
      right += 1
    } else {
      left += 1
      pending.end = left
    }
  }
  flush()
  return edits
}

const sameEdit = (left: TextEdit, right: TextEdit): boolean =>
  left.start === right.start &&
  left.end === right.end &&
  left.lines.length === right.lines.length &&
  left.lines.every((line, index) => line === right.lines[index])

const overlaps = (left: TextEdit, right: TextEdit): boolean => {
  if (sameEdit(left, right)) return false
  const leftInsertion = left.start === left.end
  const rightInsertion = right.start === right.end
  if (leftInsertion && rightInsertion) return left.start === right.start
  if (leftInsertion) return left.start >= right.start && left.start <= right.end
  if (rightInsertion) return right.start >= left.start && right.start <= left.end
  return Math.max(left.start, right.start) < Math.min(left.end, right.end)
}

export const mergeWorldDocumentText = (
  baseSource: string,
  currentSource: string,
  incomingSource: string
): string | null => {
  const normalize = (value: string) => value.replace(/\r\n?/g, '\n')
  const base = normalize(baseSource).split('\n')
  const current = normalize(currentSource).split('\n')
  const incoming = normalize(incomingSource).split('\n')
  if (currentSource === incomingSource) return currentSource
  if (currentSource === baseSource) return incomingSource
  if (incomingSource === baseSource) return currentSource
  const currentEdits = editsFromBase(base, current)
  const incomingEdits = editsFromBase(base, incoming)
  if (!currentEdits || !incomingEdits) return null
  if (currentEdits.some((left) => incomingEdits.some((right) => overlaps(left, right)))) return null
  const edits = [...currentEdits]
  for (const incomingEdit of incomingEdits) {
    if (!edits.some((currentEdit) => sameEdit(currentEdit, incomingEdit))) edits.push(incomingEdit)
  }
  const result = [...base]
  edits
    .sort((left, right) => right.start - left.start || right.end - left.end)
    .forEach((edit) => result.splice(edit.start, edit.end - edit.start, ...edit.lines))
  return result.join('\n')
}
