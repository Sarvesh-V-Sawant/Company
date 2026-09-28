/**
 * Single desk user, used by EntityPicker to resolve a preset value into a label.
 */
import { User } from '@models/User';
import { connectDB } from '@lib/db/connect';
import { WORK_DESK_ROLES } from '@constants/roles';
import { opsQuery, requireIdParam, OpsRouteError } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

interface LeanUser {
  _id: unknown;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
}

export const GET = opsQuery('workdesk', null, async ({ params }) => {
  const id = requireIdParam(params);
  await connectDB();

  const user = await User.findOne({ _id: id, role: { $in: WORK_DESK_ROLES } })
    .select('employeeId firstName lastName email role isActive')
    .lean<LeanUser | null>();

  if (!user) {
    throw new OpsRouteError('OPS_040', 404, 'That user is not a Work Desk user.');
  }

  return {
    data: {
      _id: String(user._id),
      employeeId: user.employeeId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      name: `${user.firstName} ${user.lastName}`.trim(),
      code: user.employeeId,
    },
  };
});
