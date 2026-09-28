/**
 * Shared plumbing for Work Desk API routes (Phases 30.02–30.10).
 *
 * The 30.01 master routes repeat the same try/catch ladder in every handler.
 * That is tolerable for three routes; across the twenty new chain routes it is
 * the most likely place for an inconsistent status code to slip in. This
 * centralises the mapping while producing byte-identical response shapes — still
 * `success(data)` and `apiError(code, message, status)` from api-response, with
 * the same `{ success: true, data, pagination }` shape for list endpoints.
 *
 * ADDITIVE ONLY: no existing route is modified by this file's existence.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertWorkDeskAccess, assertRole } from '@mw/requireRole';
import { success, apiError } from '@lib/utils/api-response';
import type { JwtPayload } from '@app-types/jwt';
import { CHAIN_APPROVE_ROLES } from '@constants/roles';
import type { ChainActor } from '@services/ops/ChainService';

/** Access tier required by a handler. */
export type OpsAccessLevel =
  /** Any Work Desk role: super_admin, admin, manager, executive. */
  | 'workdesk'
  /** Approval-grade roles only: super_admin, admin, manager. */
  | 'approve';

/** Thrown by guards inside a handler to short-circuit with a specific response. */
export class OpsRouteError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpsRouteError';
  }
}

/** Maps any thrown value to the project's standard error envelope. */
export function mapOpsError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return apiError(
      err.code,
      err.httpStatus === 403 ? 'Forbidden.' : 'Unauthorized.',
      err.httpStatus,
    );
  }
  if (err instanceof AppError) {
    return apiError(err.code, err.message, err.httpStatus);
  }
  if (err instanceof OpsRouteError) {
    return apiError(err.code, err.message, err.httpStatus);
  }
  if (err instanceof ZodError) {
    // Surface the first field problem so the UI can show something actionable,
    // while keeping the existing GEN_001 code and 400 status.
    const first = err.issues[0];
    const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
    return apiError('GEN_001', `Validation failed. ${where}${first?.message ?? ''}`.trim(), 400);
  }

  // Unknown failures are logged server-side and returned as a generic 500.
  // The message is never echoed, since it can contain connection strings.
  console.error('[ops-route] Unhandled error:', err);
  return apiError('GEN_500', 'Something went wrong. Please try again.', 500);
}

/** Authenticates and authorises, returning the JWT payload and a ChainActor. */
async function resolveActor(
  request: NextRequest,
  level: OpsAccessLevel,
): Promise<{ payload: JwtPayload; actor: ChainActor }> {
  const payload = await getAuthUser(request);

  if (level === 'approve') {
    assertRole(payload, ...CHAIN_APPROVE_ROLES);
  } else {
    assertWorkDeskAccess(payload);
  }

  return {
    payload,
    actor: { userId: payload.userId, role: payload.role },
  };
}

export interface OpsHandlerContext<TInput> {
  request: NextRequest;
  payload: JwtPayload;
  actor: ChainActor;
  /** Parsed and validated input. `never`-safe when no schema is supplied. */
  input: TInput;
  /** Route params, already awaited. */
  params: Record<string, string>;
}

/** Result helpers a handler can return. */
export type OpsHandlerResult =
  | NextResponse
  | { list: unknown; pagination: unknown }
  | { created: unknown }
  | { data: unknown }
  | void;

function toResponse(result: OpsHandlerResult): NextResponse {
  if (result instanceof NextResponse) return result;
  if (result && typeof result === 'object' && 'list' in result) {
    return NextResponse.json({
      success: true,
      data: (result as { list: unknown }).list,
      pagination: (result as { pagination: unknown }).pagination,
    });
  }
  if (result && typeof result === 'object' && 'created' in result) {
    return success((result as { created: unknown }).created, 201);
  }
  if (result && typeof result === 'object' && 'data' in result) {
    return success((result as { data: unknown }).data);
  }
  return success({ ok: true });
}

/**
 * Wraps a JSON-body handler (POST/PATCH).
 *
 * @param level  Access tier enforced before the body is even read.
 * @param schema Zod schema for the body. Pass `null` for bodyless mutations.
 */
export function opsMutation<TSchema extends ZodTypeAny | null>(
  level: OpsAccessLevel,
  schema: TSchema,
  handler: (
    ctx: OpsHandlerContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined>,
  ) => Promise<OpsHandlerResult>,
) {
  return async function route(
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> {
    try {
      const { payload, actor } = await resolveActor(request, level);
      const params = context?.params ? await context.params : {};

      let input: unknown;
      if (schema) {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return apiError('GEN_001', 'Invalid JSON body.', 400);
        }
        input = schema.parse(body);
      }

      const result = await handler({
        request,
        payload,
        actor,
        input: input as TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined,
        params,
      });
      return toResponse(result);
    } catch (err) {
      return mapOpsError(err);
    }
  };
}

/**
 * Wraps a GET handler. Query params are parsed with the supplied schema.
 */
export function opsQuery<TSchema extends ZodTypeAny | null>(
  level: OpsAccessLevel,
  schema: TSchema,
  handler: (
    ctx: OpsHandlerContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined>,
  ) => Promise<OpsHandlerResult>,
) {
  return async function route(
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> {
    try {
      const { payload, actor } = await resolveActor(request, level);
      const params = context?.params ? await context.params : {};

      let input: unknown;
      if (schema) {
        const { searchParams } = new URL(request.url);
        input = schema.parse(Object.fromEntries(searchParams));
      }

      const result = await handler({
        request,
        payload,
        actor,
        input: input as TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined,
        params,
      });
      return toResponse(result);
    } catch (err) {
      return mapOpsError(err);
    }
  };
}

/**
 * Wraps a multipart upload handler. Reads and size-checks the file before the
 * handler runs, so no route has to re-implement that guard.
 */
export function opsUpload(
  level: OpsAccessLevel,
  maxBytes: number,
  handler: (
    ctx: OpsHandlerContext<undefined> & {
      file: { name: string; type: string; bytes: Uint8Array };
      fields: Record<string, string>;
    },
  ) => Promise<OpsHandlerResult>,
) {
  return async function route(
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> {
    try {
      const { payload, actor } = await resolveActor(request, level);
      const params = context?.params ? await context.params : {};

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return apiError('GEN_001', 'Expected a multipart form upload.', 400);
      }

      const raw = form.get('file');
      if (!raw || typeof raw === 'string') {
        return apiError('GEN_001', 'No file was included in the upload.', 400);
      }
      const file = raw as File;

      if (file.size > maxBytes) {
        return apiError(
          'OPS_042',
          `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${maxBytes / 1024 / 1024} MB.`,
          413,
        );
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const fields: Record<string, string> = {};
      form.forEach((value, key) => {
        if (typeof value === 'string') fields[key] = value;
      });

      const result = await handler({
        request,
        payload,
        actor,
        input: undefined,
        params,
        file: { name: file.name, type: file.type, bytes },
        fields,
      });
      return toResponse(result);
    } catch (err) {
      return mapOpsError(err);
    }
  };
}

/** Guard for a required, well-formed Mongo id route param. */
export function requireIdParam(params: Record<string, string>, key = 'id'): string {
  const value = params[key];
  if (!value || !/^[0-9a-f]{24}$/i.test(value)) {
    throw new OpsRouteError('OPS_030', 400, 'Invalid or missing identifier in the URL.');
  }
  return value;
}
