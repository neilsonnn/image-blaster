const POINTER_LOCK_SUPPRESSION_MS = 300

let lastObjectInteractionAt = 0

export function markObjectInteraction() {
  lastObjectInteractionAt = performance.now()
}

export function shouldSuppressPointerLock() {
  return performance.now() - lastObjectInteractionAt < POINTER_LOCK_SUPPRESSION_MS
}
