'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MAX_PHOTOS, type PhotoEntry } from '@/lib/book-form-schema'
import css from './PhotoPicker.module.scss'

type ErrorKey = 'unreadable' | 'tooLarge' | 'tooExtreme' | 'uploadFailed'

export type UploadOutcome =
  | { ok: true; uploadId: string; previewUrl: string }
  | { ok: false; error: ErrorKey }

export type PhotoPickerState = {
  // The photos that are ready, in the order shown. This is what Save sends.
  entries: PhotoEntry[]
  busy: boolean // something is still uploading
  failed: boolean // something failed and was not removed or retried
}

type PhotoPickerProps = {
  initialPhotos: { imageId: string; previewUrl: string }[]
  upload: (file: File, signal: AbortSignal) => Promise<UploadOutcome>
  onChange: (state: PhotoPickerState) => void
  maxPhotos?: number
}

type Tile = {
  key: string
  kind: 'existing' | 'new'
  imageId?: string
  uploadId?: string
  previewUrl?: string
  status: 'ready' | 'uploading' | 'failed'
  // Why it failed. On a ready tile it is why a replacement failed.
  error?: ErrorKey
  file?: File
  // The photo a replacement started from, put back if the replacement fails.
  previous?: Tile
}

type Direction = 'forward' | 'back'

let tileCounter = 0
const newKey = () => `tile-${++tileCounter}`

function revoke(url: string | undefined) {
  if (url?.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

export function PhotoPicker({
  initialPhotos,
  upload,
  onChange,
  maxPhotos = MAX_PHOTOS,
}: PhotoPickerProps) {
  const t = useTranslations('Admin.form.photos')
  const [tiles, setTiles] = useState<Tile[]>(() =>
    initialPhotos.map((photo) => ({
      key: `existing-${photo.imageId}`,
      kind: 'existing',
      imageId: photo.imageId,
      previewUrl: photo.previewUrl,
      status: 'ready',
    })),
  )
  const [message, setMessage] = useState('')

  // Photos are prepared one after another: resizing several large photos at once
  // can run a phone out of memory.
  const queue = useRef<{ key: string; file: File }[]>([])
  const running = useRef(false)
  const cancelled = useRef(new Set<string>())
  const controllers = useRef(new Map<string, AbortController>())
  const unmounted = useRef(false)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const focusRequest = useRef<{ key: string; direction: Direction } | null>(
    null,
  )

  useEffect(() => {
    onChange({
      entries: tiles
        .filter((tile) => tile.status === 'ready')
        .map((tile) =>
          tile.kind === 'existing'
            ? { kind: 'existing', imageId: tile.imageId! }
            : { kind: 'new', uploadId: tile.uploadId! },
        ),
      busy: tiles.some((tile) => tile.status === 'uploading'),
      failed: tiles.some((tile) => tile.status === 'failed'),
    })
  }, [tiles, onChange])

  // After a move, keep the keyboard focus on the moved photo: on the same
  // direction while it can go further, otherwise on the other one.
  useEffect(() => {
    const request = focusRequest.current
    if (!request) return
    focusRequest.current = null
    const other: Direction =
      request.direction === 'forward' ? 'back' : 'forward'
    const button =
      buttons.current.get(`${request.key}:${request.direction}`) ??
      buttons.current.get(`${request.key}:${other}`)
    button?.focus()
  }, [tiles])

  // When the form is left: stop the upload that is running and forget the ones
  // still waiting, so nothing carries on in the background (battery, data,
  // upload tickets). React's development mode mounts a component twice, so a
  // mount clears the mark again.
  useEffect(() => {
    unmounted.current = false
    const active = controllers.current
    const waiting = queue.current
    return () => {
      unmounted.current = true
      waiting.length = 0
      for (const controller of active.values()) controller.abort()
    }
  }, [])

  async function drain() {
    if (running.current) return
    running.current = true
    try {
      while (queue.current.length > 0 && !unmounted.current) {
        const { key, file } = queue.current.shift()!
        if (cancelled.current.has(key)) continue

        const controller = new AbortController()
        controllers.current.set(key, controller)
        let outcome: UploadOutcome
        try {
          outcome = await upload(file, controller.signal)
        } catch {
          outcome = { ok: false, error: 'uploadFailed' }
        }
        controllers.current.delete(key)
        if (controller.signal.aborted || cancelled.current.has(key)) continue

        setTiles((current) =>
          current.map((tile) => {
            if (tile.key !== key) return tile
            if (outcome.ok) {
              revoke(tile.previous?.previewUrl)
              return {
                key,
                kind: 'new',
                uploadId: outcome.uploadId,
                previewUrl: outcome.previewUrl,
                status: 'ready',
              }
            }
            // A failed replacement puts the old photo back, with the reason.
            return tile.previous
              ? { ...tile.previous, error: outcome.error }
              : { ...tile, status: 'failed', error: outcome.error }
          }),
        )
      }
    } finally {
      running.current = false
    }
  }

  function enqueue(items: { key: string; file: File }[]) {
    queue.current.push(...items)
    void drain()
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = '' // so the same file can be chosen again
    if (picked.length === 0) return

    const free = Math.max(0, maxPhotos - tiles.length)
    const accepted = picked.slice(0, free)
    setMessage(
      picked.length > accepted.length
        ? t('limited', { count: accepted.length, max: maxPhotos })
        : '',
    )
    if (accepted.length === 0) return

    const added = accepted.map((file) => ({ key: newKey(), file }))
    setTiles((current) => [
      ...current,
      ...added.map(({ key, file }): Tile => ({
        key,
        kind: 'new',
        status: 'uploading',
        file,
      })),
    ])
    enqueue(added)
  }

  function onReplace(key: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage('')
    setTiles((current) =>
      current.map((tile) =>
        tile.key === key
          ? {
              ...tile,
              status: 'uploading',
              file,
              error: undefined,
              previous: { ...tile, error: undefined },
            }
          : tile,
      ),
    )
    enqueue([{ key, file }])
  }

  function retry(tile: Tile) {
    if (!tile.file) return
    setMessage('')
    setTiles((current) =>
      current.map((t) =>
        t.key === tile.key
          ? { ...t, status: 'uploading', error: undefined }
          : t,
      ),
    )
    enqueue([{ key: tile.key, file: tile.file }])
  }

  function remove(tile: Tile) {
    cancelled.current.add(tile.key)
    controllers.current.get(tile.key)?.abort()
    revoke(tile.previewUrl)
    revoke(tile.previous?.previewUrl)
    setTiles((current) => current.filter((t) => t.key !== tile.key))
    setMessage(t('removed'))
  }

  function move(index: number, direction: Direction) {
    const target = direction === 'forward' ? index - 1 : index + 1
    const key = tiles[index].key
    focusRequest.current = { key, direction }
    setTiles((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setMessage(t('moved', { n: target + 1, total: tiles.length }))
  }

  const full = tiles.length >= maxPhotos

  return (
    <div className={css.picker}>
      <p className={css.hint}>{t('hint')}</p>
      <p className={css.counter}>
        {t('counter', { count: tiles.length, max: maxPhotos })}
      </p>

      <ul className={css.tiles} aria-label={t('listLabel')}>
        {tiles.map((tile, index) => {
          const n = index + 1
          const busy = tile.status === 'uploading'
          return (
            <li key={tile.key} className={css.tile}>
              <p className={css.tileTitle}>
                {t('tileTitle', { n, total: tiles.length })}
              </p>
              {tile.previewUrl && tile.status === 'ready' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={css.preview}
                  src={tile.previewUrl}
                  alt={t('previewAlt', { n })}
                />
              ) : (
                <div className={css.placeholder} aria-hidden="true" />
              )}

              {busy && <p className={css.state}>{t('uploading')}</p>}
              {!busy && tile.kind === 'new' && tile.status === 'ready' && (
                <p className={css.state}>{t('ready')}</p>
              )}
              {tile.error && (
                <p className={css.error}>{t(`errors.${tile.error}`)}</p>
              )}

              <div className={css.actions}>
                {tile.status === 'failed' && (
                  <button
                    type="button"
                    className={css.button}
                    onClick={() => retry(tile)}
                  >
                    {t('retry')}
                  </button>
                )}
                {tile.status === 'ready' && index > 0 && (
                  <button
                    type="button"
                    className={css.button}
                    aria-label={t('forwardLabel', { n })}
                    ref={(element) => {
                      if (element)
                        buttons.current.set(`${tile.key}:forward`, element)
                      else buttons.current.delete(`${tile.key}:forward`)
                    }}
                    onClick={() => move(index, 'forward')}
                  >
                    {t('forward')}
                  </button>
                )}
                {tile.status === 'ready' && index < tiles.length - 1 && (
                  <button
                    type="button"
                    className={css.button}
                    aria-label={t('backLabel', { n })}
                    ref={(element) => {
                      if (element)
                        buttons.current.set(`${tile.key}:back`, element)
                      else buttons.current.delete(`${tile.key}:back`)
                    }}
                    onClick={() => move(index, 'back')}
                  >
                    {t('back')}
                  </button>
                )}
                {tile.status === 'ready' && (
                  <label className={css.button}>
                    {t('replace')}
                    <input
                      type="file"
                      accept="image/*"
                      className={css.fileInput}
                      aria-label={t('replaceLabel', { n })}
                      onChange={(event) => onReplace(tile.key, event)}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className={css.button}
                  aria-label={t('removeLabel', { n })}
                  onClick={() => remove(tile)}
                >
                  {t('remove')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <label className={`${css.button} ${css.add}`} aria-disabled={full}>
        {t('add')}
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={full}
          className={css.fileInput}
          onChange={onPick}
        />
      </label>

      <p role="status" className={css.status}>
        {message}
      </p>
    </div>
  )
}
