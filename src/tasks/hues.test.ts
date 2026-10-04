import { describe, expect, it } from 'vitest'
import { goalRank, hueOf, NEUTRAL_HUE } from './hues'
import type { Project } from './types'

const p = (id: string, over: Partial<Project> = {}): Project => ({
  id,
  name: id,
  color: 'charcoal',
  parentId: null,
  inbox: false,
  childOrder: 0,
  ...over,
})

describe('hueOf (lesson 7)', () => {
  const projects: Record<string, Project> = {
    gpa: p('gpa', { name: 'Term 2 GPA', color: 'berry_red' }),
    sub: p('sub', { parentId: 'gpa', color: 'blue' }),
    subsub: p('subsub', { parentId: 'sub', color: 'green' }),
    inbox: p('inbox', { inbox: true, color: 'red' }),
    odd: p('odd', { color: 'not_a_colour' }),
  }
  it('maps a Todoist colour name onto the palette', () => {
    expect(hueOf('gpa', projects)).toBe('#E0314B')
  })
  it('sub-projects inherit the top-level parent colour', () => {
    expect(hueOf('sub', projects)).toBe('#E0314B')
    expect(hueOf('subsub', projects)).toBe('#E0314B')
  })
  it('Inbox, unknown projects and unknown colours are neutral', () => {
    expect(hueOf('inbox', projects)).toBe(NEUTRAL_HUE)
    expect(hueOf('missing', projects)).toBe(NEUTRAL_HUE)
    expect(hueOf('odd', projects)).toBe(NEUTRAL_HUE)
  })
})

describe('goalRank', () => {
  it('orders Inbox, then goals by priority, then others, Life Admin last', () => {
    const list = [
      p('a', { name: 'Life Admin' }),
      p('b', { name: 'Better Writer' }),
      p('c', { name: 'Term 2 GPA' }),
      p('d', { inbox: true, name: 'Inbox' }),
    ]
    expect(list.sort((x, y) => goalRank(x) - goalRank(y)).map((x) => x.name)).toEqual([
      'Inbox',
      'Term 2 GPA',
      'Better Writer',
      'Life Admin',
    ])
  })
})
