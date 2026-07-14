import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { LocationSnapshot } from '@models/LocationSnapshot';
import { AttendanceSession } from '@models/AttendanceSession';
import { AppError } from '@services/AuthService';
import { GeocodingService } from '@services/GeocodingService';
import type { CreateLocationSnapshotInput, ListLocationSnapshotsInput } from '@validators/locationSnapshot';

export const LocationSnapshotService = {
  async create(employeeId: string, input: CreateLocationSnapshotInput) {
    await connectDB();

    const empOid = new mongoose.Types.ObjectId(employeeId);

    // Must have an active remote session
    const activeSession = await AttendanceSession.findOne({
      employeeId: empOid,
      isActive: true,
    }).lean();

    if (!activeSession) {
      throw new AppError('ATT_007', 409, 'No active session.');
    }
    if (!activeSession.isRemote) {
      throw new AppError('ATT_008', 409, 'Location tracking only active for remote sessions.');
    }

    const now = new Date();
    const dateString = activeSession.dateString;

    const snapshot = await LocationSnapshot.create({
      employeeId:          empOid,
      attendanceSessionId: activeSession._id,
      dateString,
      latitude:   input.latitude,
      longitude:  input.longitude,
      accuracy:   input.accuracy,
      capturedAt: now,
      source:     'mobile',
    });

    // Fire-and-forget reverse geocoding — never blocks snapshot upload
    const snapshotId = snapshot._id.toString();
    GeocodingService.reverseGeocode(input.latitude, input.longitude)
      .then((geo) =>
        LocationSnapshot.findByIdAndUpdate(snapshotId, {
          $set: {
            address: geo.address,
            geocodingStatus: geo.geocodingStatus,
            geocodingProvider: geo.geocodingProvider,
          },
        }),
      )
      .catch(() => {});

    return {
      id:                  snapshotId,
      attendanceSessionId: snapshot.attendanceSessionId.toString(),
      dateString:          snapshot.dateString,
      latitude:            snapshot.latitude,
      longitude:           snapshot.longitude,
      accuracy:            snapshot.accuracy,
      capturedAt:          snapshot.capturedAt.toISOString(),
    };
  },

  async list(query: ListLocationSnapshotsInput) {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (query.employeeId) filter.employeeId = new mongoose.Types.ObjectId(query.employeeId);
    if (query.dateString) filter.dateString = query.dateString;

    const skip = (query.page - 1) * query.limit;
    const [snapshots, total] = await Promise.all([
      LocationSnapshot.find(filter)
        .sort({ capturedAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .populate('employeeId', 'firstName lastName employeeId')
        .lean(),
      LocationSnapshot.countDocuments(filter),
    ]);

    return {
      snapshots: snapshots.map((s) => ({
        id:                  s._id.toString(),
        employeeId:          s.employeeId.toString(),
        attendanceSessionId: s.attendanceSessionId.toString(),
        dateString:          s.dateString,
        latitude:            s.latitude,
        longitude:           s.longitude,
        accuracy:            s.accuracy,
        capturedAt:          s.capturedAt.toISOString(),
        source:              s.source,
        address:             s.address ?? null,
        geocodingStatus:     s.geocodingStatus ?? null,
        geocodingProvider:   s.geocodingProvider ?? null,
      })),
      pagination: {
        total,
        page:       query.page,
        limit:      query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
};
