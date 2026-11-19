// QR code en SVG (bibliothèque uqr, rendu maison en un seul tracé).
import { encode } from 'uqr'

export function qrPath(text) {
  const { data, size } = encode(text, { ecc: 'M', border: 2 })
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y][x]) d += `M${x} ${y}h1v1h-1z`
    }
  }
  return { d, size }
}
