/**
 * Assignable Work Desk users (Phase 30.02).
 *
 * Chain hand-over needs a person picker, and no endpoint existed that lists desk
 * users — /api/v1/employees is the HR employee directory, which is a different
 * set and a different permission. This returns only active users holding a Work
 * Desk role, and only the fields a picker needs. No salary, no device data, no
 * password hash.
 *
 * `name` and `code` are computed so the shared EntityPicker works with its
 * default label keys.
 */
import { User } from '@models/User';
import { connectDB } from '@lib/db/connect';
import { WORK_DESK_ROLES } from '@constants/roles';
import { OpsListQuerySchema } from '@validators/ops/shared';
import { escapeRegExp } from '@lib/utils/regex';
import { calcSkip } from '@lib/utils/pagination';
import { opsQuery } from '@lib/utils/ops-route';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListDeskUsersSchema = OpsListQuerySchema.extend({
  role: z.enum(['super_admin', 'admin', 'manager', 'executive']).optional(),
});

interface LeanUser {
  _id: unknown;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
}

export const GET = opsQuery('workdesk', ListDeskUsersSchema, async ({ input }) => {
  await connectDB();

  const filter: Record<string, unknown> = {
    role: input.role ? input.role : { $in: WORK_DESK_ROLES },
  };

  // Default to active users only; a picker should not offer a disabled account.
  filter.isActive = input.isActive === undefined ? true : input.isActive;

  if (input.search) {
    const re = new RegExp(escapeRegExp(input.search), 'i');
    filter.$or = [
      { firstName: re }, { lastName: re }, { email: re }, { employeeId: re },
    ];
  }

  const skip = calcSkip({ page: input.page, limit: input.limit });

  const [rows, total] = await Promise.all([
    User.find(filter)
      .select('employeeId firstName lastName email role isActive')
      .sort({ firstName: 1, lastName: 1 })
      .skip(skip)
      .limit(input.limit)
      .lean<LeanUser[]>(),
    User.countDocuments(filter),
  ]);

  return {
    list: rows.map((u) => ({
      _id: String(u._id),
      employeeId: u.employeeId,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      name: `${u.firstName} ${u.lastName}`.trim(),
      code: u.employeeId,
    })),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
});
