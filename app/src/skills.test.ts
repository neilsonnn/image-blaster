import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const skillsDir = path.resolve(__dirname, '../../.claude/skills')

describe('skills', () => {
  it('skills directory exists and contains skill subdirectories', () => {
    expect(fs.existsSync(skillsDir)).toBe(true)
    const dirs = fs.readdirSync(skillsDir).filter((f) =>
      fs.statSync(path.join(skillsDir, f)).isDirectory(),
    )
    expect(dirs.length).toBeGreaterThan(0)
  })

  it('each skill has a SKILL.md with a # title and ## Instructions or ## Steps section', () => {
    const dirs = fs.readdirSync(skillsDir).filter((f) =>
      fs.statSync(path.join(skillsDir, f)).isDirectory(),
    )
    for (const dir of dirs) {
      const skillFile = path.join(skillsDir, dir, 'SKILL.md')
      expect(fs.existsSync(skillFile), `${dir}/SKILL.md missing`).toBe(true)
      const content = fs.readFileSync(skillFile, 'utf-8')
      const hasTitle = /^# .+/m.test(content) || /^name:\s*.+/m.test(content)
      expect(hasTitle, `${dir}: missing # title or name: frontmatter`).toBe(true)
      const hasInstructions = /^## Instructions/m.test(content)
      const hasSteps = /^## Steps/m.test(content)
      expect(hasInstructions || hasSteps, `${dir}: missing ## Instructions or ## Steps`).toBe(true)
    }
  })
})
