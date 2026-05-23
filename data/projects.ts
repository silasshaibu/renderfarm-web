export interface ProjectRow {
  id: string
  name: string
  users: number
  jobs: number
  storageGb: number
  created: string
  active: boolean
}

export const PROJECTS: ProjectRow[] = [
  { id: 'p1', name: 'ConductorRenderTest', users: 2, jobs: 161, storageGb: 48.3, created: '2026-01-10', active: true  },
  { id: 'p2', name: 'ArchViz_Ext',         users: 3, jobs:  42, storageGb: 82.7, created: '2026-02-18', active: true  },
  { id: 'p3', name: 'ProductAnim_Q2',      users: 2, jobs:  28, storageGb: 31.1, created: '2026-03-05', active: true  },
  { id: 'p4', name: 'BrandFilm_2025',      users: 1, jobs:  15, storageGb:  9.4, created: '2025-11-20', active: false },
]

export const ACTIVE_PROJECTS   = PROJECTS.filter((p) => p.active)
export const ARCHIVED_PROJECTS = PROJECTS.filter((p) => !p.active)
