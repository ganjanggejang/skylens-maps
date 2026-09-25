import type { RoutingEdge } from './types'

type Item = { node: number; seconds: number }
class Heap {
  private items: Item[] = []
  get length() { return this.items.length }
  push(item: Item) {
    const items = this.items
    let index = items.length
    items.push(item)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (items[parent].seconds <= item.seconds) break
      items[index] = items[parent]; index = parent
    }
    items[index] = item
  }
  pop(): Item | undefined {
    const items = this.items
    const top = items[0], last = items.pop()
    if (!items.length || !last) return top
    let index = 0
    while (true) {
      const left = index * 2 + 1
      if (left >= items.length) break
      const right = left + 1
      const child = right < items.length && items[right].seconds < items[left].seconds ? right : left
      if (items[child].seconds >= last.seconds) break
      items[index] = items[child]; index = child
    }
    items[index] = last
    return top
  }
}

export function shortestPath(adjacency: RoutingEdge[][], start: number, destination: number): RoutingEdge[] | null {
  const distance = new Float64Array(adjacency.length).fill(Infinity)
  const previous: Array<RoutingEdge | undefined> = Array(adjacency.length)
  const from = new Int32Array(adjacency.length).fill(-1)
  const heap = new Heap()
  distance[start] = 0; heap.push({ node: start, seconds: 0 })
  while (heap.length) {
    const current = heap.pop()!
    if (current.seconds !== distance[current.node]) continue
    if (current.node === destination) break
    for (const edge of adjacency[current.node]) {
      const candidate = current.seconds + edge.seconds
      if (candidate >= distance[edge.to]) continue
      distance[edge.to] = candidate
      previous[edge.to] = edge
      from[edge.to] = current.node
      heap.push({ node: edge.to, seconds: candidate })
    }
  }
  if (!Number.isFinite(distance[destination])) return null
  const path: RoutingEdge[] = []
  for (let node = destination; node !== start; node = from[node]) {
    const edge = previous[node]
    if (!edge) return null
    path.push(edge)
  }
  return path.reverse()
}
