import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AttendanceSession } from '@models/AttendanceSession';
import { LocationSnapshot } from '@models/LocationSnapshot';
import { User } from '@models/User';

const FRESH_THRESHOLD_MS = 75 * 60 * 1000;

export type LocationFreshness = 'fresh' | 'stale' | 'noSnapshot';

export interface ActiveRemoteLocation {
  sessionId: string;
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string | null;
  designation: string | null;
  remoteSource: string;
  checkInTimestamp: string;
  checkInAddress: string | null;
  latestSnapshot: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
    address: string | null;
    geocodingStatus: string | null;
  } | null;
  freshness: LocationFreshness;
}

export const RemoteLocationsService = {
  async getActive(): Promise<ActiveRemoteLocation[]> {
    await connectDB();

    const sessions = await AttendanceSession.find({ isActive: true, isRemote: true }).lean();
    if (sessions.length === 0) return [];

    const empIds = sessions.map((s) => s.employeeId as mongoose.Types.ObjectId);
    const users = await User.find({ _id: { $in: empIds } })
      .select('_id employeeId firstName lastName department designation')
      .lean();
    const userMap = new Map(users.map((u) => [(u._id as mongoose.Types.ObjectId).toHexString(), u]));

    // Latest snapshot per session via aggregation
    const sessionIds = sessions.map((s) => s._id as mongoose.Types.ObjectId);
    const latestSnapshots = await LocationSnapshot.aggregate([
      { $match: { attendanceSessionId: { $in: sessionIds } } },
      { $sort: { capturedAt: -1 } },
      {
        $group: {
          _id: '$attendanceSessionId',
          latitude:        { $first: '$latitude' },
          longitude:       { $first: '$longitude' },
          accuracy:        { $first: '$accuracy' },
          capturedAt:      { $first: '$capturedAt' },
          address:         { $first: '$address' },
          geocodingStatus: { $first: '$geocodingStatus' },
        },
      },
    ]);
    const snapshotMap = new Map(
      latestSnapshots.map((s) => [(s._id as mongoose.Types.ObjectId).toHexString(), s]),
    );

    const now = Date.now();

    return sessions
      .map((session) => {
        const empIdStr  = (session.employeeId as mongoose.Types.ObjectId).toHexString();
        const sessionId = (session._id as mongoose.Types.ObjectId).toHexString();
        const user      = userMap.get(empIdStr);
        const snap      = snapshotMap.get(sessionId);

        let freshness: LocationFreshness = 'noSnapshot';
        if (snap) {
          const ageMs = now - new Date(snap.capturedAt as Date).getTime();
          freshness = ageMs <= FRESH_THRESHOLD_MS ? 'fresh' : 'stale';
        }

        return {
          sessionId,
          employeeId:       empIdStr,
          employeeCode:     user?.employeeId ?? '',
          firstName:        user?.firstName  ?? '',
          lastName:         user?.lastName   ?? '',
          department:       user?.department ?? null,
          designation:      user?.designation ?? null,
          remoteSource:     session.remoteSource ?? 'employeeOverride',
          checkInTimestamp: session.checkIn.timestamp.toISOString(),
          checkInAddress:   session.checkIn.address ?? null,
          latestSnapshot: snap
            ? {
                latitude:        snap.latitude as number,
                longitude:       snap.longitude as number,
                accuracy:        snap.accuracy as number,
                capturedAt:      (snap.capturedAt as Date).toISOString(),
                address:         (snap.address as string | null) ?? null,
                geocodingStatus: (snap.geocodingStatus as string | null) ?? null,
              }
            : null,
          freshness,
        };
      })
      .sort((a, b) => b.checkInTimestamp.localeCompare(a.checkInTimestamp));
  },
};
