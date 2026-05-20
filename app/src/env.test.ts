import { describe, it, expect } from 'vitest'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const requiredEnvVars = ['WORLD_LABS_API_KEY', 'FAL_KEY'] as const
const exampleEnvPath = path.resolve(__dirname, '../../.env.example')

describe('env example', () => {
  it('documents every required API key', () => {
    const exampleEnv = dotenv.parse(fs.readFileSync(exampleEnvPath))

    for (const name of requiredEnvVars) {
      expect(exampleEnv[name], `${name} missing from .env.example`).toBeTruthy()
    }
  })
})
