import { Prisma } from "@prisma/client";

const DEFAULT_WORKFLOW_LIMIT = 50;
const MAX_WORKFLOW_LIMIT = 100;

export function cleanWorkflowId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function parseWorkflowLimit(value: string | null):
  | { ok: true; limit: number }
  | { ok: false; error: string } {
  if (!value) return { ok: true, limit: DEFAULT_WORKFLOW_LIMIT };

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, error: "limit must be a positive whole number." };
  }

  return { ok: true, limit: Math.min(parsed, MAX_WORKFLOW_LIMIT) };
}

export function cleanWorkflowFilter(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function serializeWorkflowRunSummary(workflow: {
  id: string;
  type: string;
  status: string;
  error: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: workflow.id,
    type: workflow.type,
    status: workflow.status,
    error: workflow.error,
    metadata: workflow.metadata,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  };
}

export function serializeWorkflowRun(workflow: {
  id: string;
  type: string;
  status: string;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue | null;
  error: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...serializeWorkflowRunSummary(workflow),
    input: workflow.input,
    output: workflow.output,
  };
}
