export type Opportunity = {
  id: number
  title: string
  rationale: string
  whyItMatters: string
  image: string | null
}

export type Hotspot = {
  /** Percentage of the plan image's width, 0–100. */
  x: number
  /** Percentage of the plan image's height, 0–100. */
  y: number
}

export type Floor = {
  id: string
  label: string
  /** Filename inside the plan image directory, e.g. "ground.png". */
  plan: string
  /** Opportunity ids shown on this floor. */
  active: number[]
  /** Opportunity id (as a string key) -> position on this floor's plan. */
  hotspots: Record<string, Hotspot>
}

export type PlanData = {
  opportunities: Opportunity[]
  floors: Floor[]
}
