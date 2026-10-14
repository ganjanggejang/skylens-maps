// Keep the hue and full opacity while making the hovered color richer.
export function hoverColor(color: string): string {
  const channels = [1, 3, 5].map(offset =>
    Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.8).toString(16).padStart(2, '0'))
  return `#${channels.join('')}`
}
