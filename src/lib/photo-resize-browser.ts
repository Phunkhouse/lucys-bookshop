import type { Decoded, ResizeDeps } from './photo-resize'

type BrowserDecoded = Decoded & { source: CanvasImageSource }

// Decoding and drawing with the browser's own tools. This is the part that needs
// a real browser: it is checked there, not in the unit tests.
export const browserResizeDeps: ResizeDeps = {
  async decode(file) {
    // createImageBitmap is fast and can read the photo's orientation (phones
    // store portrait photos rotated). Older browsers fall back to an image
    // element, which also draws the photo the right way up.
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',
        })
        return {
          width: bitmap.width,
          height: bitmap.height,
          source: bitmap,
          close: () => bitmap.close(),
        } satisfies BrowserDecoded
      } catch {
        // Fall through to the image element.
      }
    }

    const url = URL.createObjectURL(file)
    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      close: () => URL.revokeObjectURL(url),
    } satisfies BrowserDecoded
  },

  async encode(decoded, size, quality) {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    try {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No 2D canvas')
      // JPEG has no transparency: a PNG with a see-through background would
      // turn black without this.
      context.fillStyle = '#fff'
      context.fillRect(0, 0, size.width, size.height)
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        (decoded as BrowserDecoded).source,
        0,
        0,
        size.width,
        size.height,
      )

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      // A browser that cannot encode JPEG silently returns a PNG.
      if (!blob || blob.type !== 'image/jpeg') throw new Error('No JPEG')
      return blob
    } finally {
      // Phones limit how much canvas memory a page may hold.
      canvas.width = 0
      canvas.height = 0
    }
  },
}
