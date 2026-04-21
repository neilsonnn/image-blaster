type TransitionCallbacks = {
  onFadeOut: () => void
  onSwap: () => void
  onFadeIn: () => void
}

// Orchestrates world switch: fade out → swap → fade in
export async function runWorldTransition(
  { onFadeOut, onSwap, onFadeIn }: TransitionCallbacks,
  fadeMs = 600,
) {
  onFadeOut()
  await delay(fadeMs)
  onSwap()
  await delay(50) // one frame gap before fade in
  onFadeIn()
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
