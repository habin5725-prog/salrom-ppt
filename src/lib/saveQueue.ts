/** Commit snapshots in update order, including writes triggered when the tab is hidden. */
export function createSerializedSaveQueue<T>(write: (value: T) => Promise<void>) {
  let tail: Promise<void> = Promise.resolve()
  let latestQueuedVersion = 0

  return (snapshot: T, version: number): Promise<void> => {
    if (version <= latestQueuedVersion) return tail
    latestQueuedVersion = version
    const operation = tail.catch(() => undefined).then(() => write(snapshot))
    tail = operation
    return operation
  }
}
