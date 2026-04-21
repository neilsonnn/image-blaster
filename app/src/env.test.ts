import { describe, it, expect } from 'vitest'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

describe('env vars', () => {
  it('WORLD_LABS_API_KEY is set', () => {
    expect(typeof process.env.WORLD_LABS_API_KEY).toBe('string')
    expect(process.env.WORLD_LABS_API_KEY!.length).toBeGreaterThan(0)
  })

  it('GEMINI_API_KEY is set', () => {
    expect(typeof process.env.GEMINI_API_KEY).toBe('string')
    expect(process.env.GEMINI_API_KEY!.length).toBeGreaterThan(0)
  })
})
