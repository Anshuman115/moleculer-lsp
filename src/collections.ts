export function appendTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key)
  if (existing === undefined) {
    map.set(key, [value])
  } else {
    existing.push(value)
  }
}
