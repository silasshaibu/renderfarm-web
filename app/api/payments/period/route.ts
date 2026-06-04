import { NextRequest } from 'next/server'
import { GET as budgetGET } from '../budget/route'

// Alias for /api/payments/budget
export const GET = budgetGET
