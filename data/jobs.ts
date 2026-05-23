import type { Job } from '@/types/job'

// ---------------------------------------------------------------------------
// Seed data — three completed Blender renders
// ---------------------------------------------------------------------------
export const MOCK_JOBS: Job[] = [
  {
    id: '00159',
    user: 'silas',
    status: 'downloaded',
    project: 'ConductorRenderTest',
    title: 'Blender 3.1.0 Linux render_001',
    priority: 5,
    cores: 16,
    memory: '64 GB',
    preemptible: true,
    progress: 100,
    tasks: 6,
    avgFrame: '9m 32s',
    created: '2026-05-20T08:14:00Z',
  },
  {
    id: '00160',
    user: 'silas',
    status: 'downloaded',
    project: 'ConductorRenderTest',
    title: 'Blender 3.1.0 Linux render_002',
    priority: 5,
    cores: 16,
    memory: '64 GB',
    preemptible: true,
    progress: 100,
    tasks: 4,
    avgFrame: '9m 41s',
    created: '2026-05-20T09:02:00Z',
  },
  {
    id: '00161',
    user: 'silas',
    status: 'running',
    project: 'ConductorRenderTest',
    title: 'Blender 3.1.0 Linux render_003',
    priority: 5,
    cores: 16,
    memory: '64 GB',
    preemptible: false,
    progress: 63,
    tasks: 8,
    avgFrame: '9m 19s',
    created: '2026-05-21T11:47:00Z',
  },
]

// ---------------------------------------------------------------------------
// Extended detail — extra fields shown on the /jobs/[id] page
// ---------------------------------------------------------------------------
export interface JobDetail extends Job {
  outputPath: string
  statusDescription: string
  instance: string
}

export const MOCK_JOB_DETAILS: Record<string, JobDetail> = {
  '00159': {
    ...MOCK_JOBS[0],
    outputPath: 'C:/tmp/old/x',
    statusDescription: '',
    instance: 'cw-epycmilan-16-rtxa6000-1',
  },
  '00160': {
    ...MOCK_JOBS[1],
    outputPath: 'C:/tmp/old/x',
    statusDescription: '',
    instance: 'cw-epycmilan-16-rtxa6000-2',
  },
  '00161': {
    ...MOCK_JOBS[2],
    outputPath: 'C:/tmp/old/x',
    statusDescription: '',
    instance: 'cw-epycmilan-16-rtxa6000-2',
  },
}

// ---------------------------------------------------------------------------
// Task rows shown in the job detail table
// ---------------------------------------------------------------------------
export interface TaskRow {
  taskId: string
  frame: number
  status: Job['status']
  cores: number
  memory: string
  preemptible: boolean
  elapsed: string
  startTime: string   // ISO
  endTime: string     // ISO
}

// ---------------------------------------------------------------------------
// Task detail — shown on /jobs/[id]/[taskId]/log
// ---------------------------------------------------------------------------
export interface TaskExecution {
  index: number
  logs: string      // empty string = "No logs found."
  env: Record<string, string>
}

export interface TaskDetail extends TaskRow {
  jobId: string
  user: string
  project: string
  instance: string
  outputPath: string
  statusDescription: string
  command: string
  uploadedFiles: string[]
  executions: TaskExecution[]
}

const BLENDER_CMD =
  'blender -b -noaudio "/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/' +
  '0CorrugatedBoard_FullLine_2x4.blend" -P "/Users/Administrator/Conductor/blender/cioblender/scripts/brender.py"' +
  ' -E "CYCLES" --render-output "/tmp/old/x/0CorrugatedBoard_FullLine_2x4_" -- render_device=GPU' +
  ' --machine_type=cw-epycmilan-16-rtxa6000-2 --start=13060 --end=13060 --resolution_x=14042' +
  ' --resolution_y=4680 --camera="CAM-1" --samples=100 --update_camera_checkbox=UPDATE_CAMERA_OFF' +
  ' --view_layers_checkbox=VIEW_LAYERS_OFF'

const UPLOADED_FILES: string[] = [
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/0CorrugatedBoard_FullLine_2x4.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/0CorrugatedBoard_FullLine_2x4-Window-useCase-MostLinkedCollection-Disabled.JPG',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/0CorrugatedBoard_FullLine_2x4-Window-useCase-MostLinkedCollection-Enabled.JPG',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/0CorrugatedBoard_FullLine_2x5.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/0CorrugatedBoard_FullLine_2x3.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/1WindEndStandardStatic_Link.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/2TransactionStandAlone-Static_Link.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/3DryEndStandAlone-Static_Link.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/4BeltStatic_Link.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/4HeatSection_Link.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/4Mission_Link.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/4ReelStand_Static_Link.blend',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/AO.jpg',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/RefAcheronMichelinRed-SpiralTurnsDesmox.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/CirSingleStripe.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/CylInderMetallicDiffuseManual.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/PaperLine/PaperLine_Palette04_2k_JPG_Metalness.jpg',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/inspection/Action_speedfloor-transparent.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/normal_B372_normal_drives_1k.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/normal_B372_roughness_1k.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/Seam-Ylable-2k-Horizontal-Seamless.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/WindowGlass-SmallMesh-Pattern.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/floor_albedo.png',
  'D:/_Source_File-INO-USA/CorrugatedPaperLineProject/CorrugatedPaperLineProject/textures/normal_B372_normal_drives_1k.png',
]

const TASK_ENV: Record<string, string> = {
  CT_CORES:          '16',
  CT_INSTANCE:       'cw-epycmilan-16-rtxa6000-2',
  CT_JOB_ID:         '00161',
  CT_OUTPUT:         '/tmp/old/x',
  CT_PROJECT:        'ConductorRenderTest',
  RENDER_DEVICE:     'GPU',
  CYCLES_SAMPLES:    '100',
  BLENDER_VERSION:   '3.1.0',
}

export const MOCK_TASK_DETAILS: Record<string, Record<string, TaskDetail>> = {
  '00161': {
    '000': {
      taskId: '000', jobId: '00161', frame: 13060,
      status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false,
      elapsed: '9.55 Minutes', startTime: '2026-05-21T11:31:56Z', endTime: '2026-05-21T11:41:29Z',
      user: 'Administrator', project: 'ConductorRenderTest',
      instance: 'cw-epycmilan-16-rtxa6000-2',
      outputPath: 'C:/tmp/old/x',
      statusDescription: '',
      command: BLENDER_CMD,
      uploadedFiles: UPLOADED_FILES,
      executions: [{ index: 1, logs: '', env: TASK_ENV }],
    },
    '001': {
      taskId: '001', jobId: '00161', frame: 13061,
      status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false,
      elapsed: '9.22 Minutes', startTime: '2026-05-21T11:32:10Z', endTime: '2026-05-21T11:41:21Z',
      user: 'Administrator', project: 'ConductorRenderTest',
      instance: 'cw-epycmilan-16-rtxa6000-2',
      outputPath: 'C:/tmp/old/x',
      statusDescription: '',
      command: BLENDER_CMD.replace('13060', '13061').replace('13060', '13061'),
      uploadedFiles: UPLOADED_FILES,
      executions: [{ index: 1, logs: '', env: TASK_ENV }],
    },
  },
}

export const MOCK_TASKS: Record<string, TaskRow[]> = {
  // 6 tasks — all downloaded
  '00159': [
    { taskId: '000', frame: 13060, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: true,  elapsed: '9.55 Minutes', startTime: '2026-05-20T08:14:00Z', endTime: '2026-05-20T08:23:32Z' },
    { taskId: '001', frame: 13061, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: true,  elapsed: '9.32 Minutes', startTime: '2026-05-20T08:14:10Z', endTime: '2026-05-20T08:23:29Z' },
    { taskId: '002', frame: 13062, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.18 Minutes', startTime: '2026-05-20T08:14:20Z', endTime: '2026-05-20T08:23:31Z' },
    { taskId: '003', frame: 13063, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: true,  elapsed: '9.41 Minutes', startTime: '2026-05-20T08:14:30Z', endTime: '2026-05-20T08:23:58Z' },
    { taskId: '004', frame: 13064, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: true,  elapsed: '9.27 Minutes', startTime: '2026-05-20T08:14:40Z', endTime: '2026-05-20T08:23:55Z' },
    { taskId: '005', frame: 13065, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.36 Minutes', startTime: '2026-05-20T08:14:50Z', endTime: '2026-05-20T08:24:11Z' },
  ],
  // 4 tasks — all downloaded
  '00160': [
    { taskId: '000', frame: 13060, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: true,  elapsed: '9.55 Minutes', startTime: '2026-05-20T09:02:00Z', endTime: '2026-05-20T09:11:33Z' },
    { taskId: '001', frame: 13061, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: true,  elapsed: '9.44 Minutes', startTime: '2026-05-20T09:02:15Z', endTime: '2026-05-20T09:11:44Z' },
    { taskId: '002', frame: 13062, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.61 Minutes', startTime: '2026-05-20T09:02:30Z', endTime: '2026-05-20T09:12:07Z' },
    { taskId: '003', frame: 13063, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: true,  elapsed: '9.38 Minutes', startTime: '2026-05-20T09:02:45Z', endTime: '2026-05-20T09:12:08Z' },
  ],
  // 8 tasks — mix of downloaded, running, pending (job is 63% done)
  '00161': [
    { taskId: '000', frame: 13060, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.55 Minutes', startTime: '2026-05-21T11:31:56Z', endTime: '2026-05-21T11:41:29Z' },
    { taskId: '001', frame: 13061, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.22 Minutes', startTime: '2026-05-21T11:32:10Z', endTime: '2026-05-21T11:41:21Z' },
    { taskId: '002', frame: 13062, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.47 Minutes', startTime: '2026-05-21T11:32:20Z', endTime: '2026-05-21T11:41:52Z' },
    { taskId: '003', frame: 13063, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.31 Minutes', startTime: '2026-05-21T11:32:35Z', endTime: '2026-05-21T11:41:53Z' },
    { taskId: '004', frame: 13064, status: 'downloaded', cores: 16, memory: '64 GB', preemptible: false, elapsed: '9.19 Minutes', startTime: '2026-05-21T11:32:50Z', endTime: '2026-05-21T11:42:02Z' },
    { taskId: '005', frame: 13065, status: 'running',    cores: 16, memory: '64 GB', preemptible: false, elapsed: '4.20 Minutes', startTime: '2026-05-21T11:43:00Z', endTime: '' },
    { taskId: '006', frame: 13066, status: 'pending',    cores: 16, memory: '64 GB', preemptible: false, elapsed: '—',            startTime: '',                      endTime: '' },
    { taskId: '007', frame: 13067, status: 'pending',    cores: 16, memory: '64 GB', preemptible: false, elapsed: '—',            startTime: '',                      endTime: '' },
  ],
}
