export type StepStatus = 'done' | 'now' | 'todo'
export type Step = { text: string; status: StepStatus }
export type Compass = {
  repo: string
  branch: string
  slug: string
  plan: string
  topic: string
  steps: Step[]
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-compass': { compass: Compass; isHidden: boolean }
  }
}
