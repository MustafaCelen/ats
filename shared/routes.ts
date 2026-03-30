import { z } from 'zod';
import {
  insertJobSchema, insertCandidateSchema, insertApplicationSchema,
  insertInterviewSchema, insertOfferSchema, insertCandidateNoteSchema,
} from './schema';

export const api = {
  jobs: {
    list:   { method: 'GET' as const,    path: '/api/jobs' },
    get:    { method: 'GET' as const,    path: '/api/jobs/:id' },
    create: { method: 'POST' as const,   path: '/api/jobs',    input: insertJobSchema },
    update: { method: 'PUT' as const,    path: '/api/jobs/:id', input: insertJobSchema.partial() },
    delete: { method: 'DELETE' as const, path: '/api/jobs/:id' },
  },
  candidates: {
    list:   { method: 'GET' as const,  path: '/api/candidates' },
    get:    { method: 'GET' as const,  path: '/api/candidates/:id' },
    create: { method: 'POST' as const, path: '/api/candidates', input: insertCandidateSchema },
    update: { method: 'PUT' as const,  path: '/api/candidates/:id', input: insertCandidateSchema.partial() },
    notes:  {
      list:   { method: 'GET' as const,  path: '/api/candidates/:id/notes' },
      create: { method: 'POST' as const, path: '/api/candidates/:id/notes', input: insertCandidateNoteSchema.omit({ candidateId: true }) },
    },
  },
  applications: {
    list:         { method: 'GET' as const,   path: '/api/applications' },
    create:       { method: 'POST' as const,  path: '/api/applications', input: insertApplicationSchema },
    updateStatus: { method: 'PATCH' as const, path: '/api/applications/:id/status', input: z.object({ status: z.string() }) },
  },
  interviews: {
    list:   { method: 'GET' as const,    path: '/api/interviews' },
    create: { method: 'POST' as const,   path: '/api/interviews', input: insertInterviewSchema },
    update: { method: 'PATCH' as const,  path: '/api/interviews/:id', input: z.object({ status: z.string() }) },
    delete: { method: 'DELETE' as const, path: '/api/interviews/:id' },
  },
  offers: {
    list:   { method: 'GET' as const,    path: '/api/offers' },
    create: { method: 'POST' as const,   path: '/api/offers', input: insertOfferSchema },
    update: { method: 'PATCH' as const,  path: '/api/offers/:id', input: z.object({ status: z.string() }) },
    delete: { method: 'DELETE' as const, path: '/api/offers/:id' },
  },
  stats: {
    dashboard: { method: 'GET' as const, path: '/api/stats/dashboard' },
    reports:   { method: 'GET' as const, path: '/api/stats/reports' },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, String(value));
    });
  }
  return url;
}
