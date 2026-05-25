import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'



// ── Instance type catalogue ───────────────────────────────────────────────────
// Prices are per-hour estimates (USD). Source: GCP/AWS spot equivalents.
const INSTANCE_TYPES = [
  // CPU-only
  { id: 'n1-standard-4',  label: 'Standard 4-core',  cores: 4,  memoryGb: 15,  gpuType: null, gpus: 0, pricePerHour: 0.19, preemptible: true  },
  { id: 'n1-standard-8',  label: 'Standard 8-core',  cores: 8,  memoryGb: 30,  gpuType: null, gpus: 0, pricePerHour: 0.38, preemptible: true  },
  { id: 'n1-standard-16', label: 'Standard 16-core', cores: 16, memoryGb: 60,  gpuType: null, gpus: 0, pricePerHour: 0.76, preemptible: true  },
  { id: 'n1-standard-32', label: 'Standard 32-core', cores: 32, memoryGb: 120, gpuType: null, gpus: 0, pricePerHour: 1.52, preemptible: true  },
  { id: 'n1-highcpu-64',  label: 'High CPU 64-core', cores: 64, memoryGb: 57,  gpuType: null, gpus: 0, pricePerHour: 2.88, preemptible: true  },
  // GPU-accelerated
  { id: 'gpu-t4-1',       label: '1× T4 GPU',         cores: 4,  memoryGb: 15,  gpuType: 'NVIDIA_TESLA_T4',   gpus: 1, pricePerHour: 0.85, preemptible: true  },
  { id: 'gpu-t4-4',       label: '4× T4 GPU',         cores: 16, memoryGb: 60,  gpuType: 'NVIDIA_TESLA_T4',   gpus: 4, pricePerHour: 3.20, preemptible: true  },
  { id: 'gpu-a10-1',      label: '1× A10G GPU',        cores: 4,  memoryGb: 16,  gpuType: 'NVIDIA_A10G',       gpus: 1, pricePerHour: 1.60, preemptible: true  },
  { id: 'gpu-a10-4',      label: '4× A10G GPU',        cores: 16, memoryGb: 64,  gpuType: 'NVIDIA_A10G',       gpus: 4, pricePerHour: 6.00, preemptible: true  },
  { id: 'gpu-a100-1',     label: '1× A100 GPU',        cores: 12, memoryGb: 85,  gpuType: 'NVIDIA_A100',       gpus: 1, pricePerHour: 3.50, preemptible: false },
  { id: 'gpu-a100-4',     label: '4× A100 GPU',        cores: 48, memoryGb: 340, gpuType: 'NVIDIA_A100',       gpus: 4, pricePerHour: 13.00, preemptible: false},
  { id: 'gpu-v100-1',     label: '1× V100 GPU',        cores: 8,  memoryGb: 61,  gpuType: 'NVIDIA_TESLA_V100', gpus: 1, pricePerHour: 2.48, preemptible: true  },
  { id: 'gpu-v100-4',     label: '4× V100 GPU',        cores: 32, memoryGb: 244, gpuType: 'NVIDIA_TESLA_V100', gpus: 4, pricePerHour: 9.20, preemptible: true  },
  // RTX workstation-grade (local worker equivalent)
  { id: 'rtx4000-1',      label: '1× RTX 4000',       cores: 4,  memoryGb: 16,  gpuType: 'RTX_4000',         gpus: 1, pricePerHour: 0.75, preemptible: true  },
  { id: 'rtx3090-1',      label: '1× RTX 3090',       cores: 8,  memoryGb: 32,  gpuType: 'RTX_3090',         gpus: 1, pricePerHour: 1.10, preemptible: true  },
]

// ── GET /api/instance-types ───────────────────────────────────────────────────
// Returns the full instance type catalogue.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(INSTANCE_TYPES)
}
