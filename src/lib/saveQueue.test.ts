import { describe, expect, it } from 'vitest'
import { createSerializedSaveQueue } from './saveQueue'

describe('serialized autosave', () => {
  it('does not let an older in-flight write overwrite a newer edit', async () => {
    const persisted: string[] = []
    let releaseFirst: (() => void) | undefined
    let notifyStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { notifyStarted = resolve })
    const queue = createSerializedSaveQueue(async (value: string) => {
      if (value === 'old') {
        notifyStarted?.()
        await new Promise<void>(resolve => { releaseFirst = resolve })
      }
      persisted.push(value)
    })

    const first = queue('old', 1)
    await started
    const second = queue('new', 2)
    const duplicateVisibilityFlush = queue('new', 2)
    expect(persisted).toEqual([])
    releaseFirst?.()
    await Promise.all([first, second, duplicateVisibilityFlush])
    expect(persisted).toEqual(['old', 'new'])
  })
})
