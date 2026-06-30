import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { sha256 } from '@lib/utils/hash';
import { sendEmail } from '@lib/email/brevo';
import { getAppUrl } from '@lib/utils/app-url';
import { User } from '@models/User';
import { DeviceRequest } from '@models/DeviceRequest';
import { DeviceSession } from '@models/DeviceSession';
import { AuditLog } from '@models/AuditLog';
import { AppError } from '@services/AuthService';

export class DeviceService {
  static async submitRequest(body: {
    email: string;
    password: string;
    deviceFingerprint: string;
    deviceName: string;
    manufacturer: string;
    deviceModel: string;
    androidVersion: string;
    appVersion: string;
    buildNumber: string;
    timezone: string;
    language: string;
    screenResolution: string;
    batteryLevel?: number;
    platform: 'android' | 'ios';
    requestIp: string;
  }) {
    await connectDB();

    const user = await User.findOne({ email: body.email, isActive: true }).select('+passwordHash');
    if (!user) throw new AppError('AUTH_001', 401, 'Invalid credentials.');

    const passwordOk = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordOk) throw new AppError('AUTH_001', 401, 'Invalid credentials.');

    const fingerprintHash = sha256(body.deviceFingerprint);

    // If already approved for this fingerprint on this user, skip
    if (user.registeredDevice?.fingerprintHash === fingerprintHash) {
      return { status: 'already_approved' as const };
    }

    const type = user.registeredDevice === null ? 'first_device' : 'replacement';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const existing = await DeviceRequest.findOne({
      userId: user._id,
      fingerprintHash,
      status: 'pending',
    });

    let request;
    if (existing) {
      existing.requestCount += 1;
      existing.requestedAt = new Date();
      existing.expiresAt = expiresAt;
      request = await existing.save();
    } else {
      request = await DeviceRequest.create({
        userId:          user._id,
        email:           body.email,
        fingerprintHash,
        deviceName:      body.deviceName,
        manufacturer:    body.manufacturer,
        deviceModel:     body.deviceModel,
        androidVersion:  body.androidVersion,
        appVersion:      body.appVersion,
        buildNumber:     body.buildNumber,
        timezone:        body.timezone,
        language:        body.language,
        screenResolution: body.screenResolution,
        batteryLevel:    body.batteryLevel,
        requestIp:       body.requestIp,
        platform:        body.platform,
        type,
        expiresAt,
      });
    }

    await AuditLog.create({
      performedBy: user._id,
      action: 'DEVICE_REQUEST_SUBMITTED',
      targetType: 'DeviceRequest',
      targetId: String(request._id),
      changes: { type, deviceName: body.deviceName, platform: body.platform },
      ipAddress: body.requestIp,
    });

    // Fire-and-forget admin notification
    DeviceService._notifyAdmins(
      `${user.firstName} ${user.lastName}`,
      user.email,
      type,
    ).catch(() => {});

    return { status: 'pending' as const, requestId: String(request._id) };
  }

  static async getRequestStatus(email: string, deviceFingerprint: string) {
    await connectDB();

    const fingerprintHash = sha256(deviceFingerprint);
    const request = await DeviceRequest.findOne(
      { email, fingerprintHash },
      { status: 1 },
    ).sort({ requestedAt: -1 });

    if (!request) return { status: 'not_found' as const };
    return { status: request.status as 'pending' | 'approved' | 'rejected' };
  }

  static async approveRequest(
    requestId: string,
    reviewedBy: string,
    approvalNote?: string,
  ) {
    await connectDB();

    const request = await DeviceRequest.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      {
        $set: {
          status:      'approved',
          reviewedAt:  new Date(),
          reviewedBy:  new mongoose.Types.ObjectId(reviewedBy),
          approvalNote,
        },
      },
      { new: true },
    );
    if (!request) throw new AppError('GEN_002', 404, 'Device request not found or already reviewed.');

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        const user = await User.findById(request.userId).session(mongoSession);
        if (!user) throw new AppError('GEN_002', 404, 'Employee not found.');

        if (request.type === 'replacement' && user.registeredDevice) {
          // Push old device to history before replacing
          await User.updateOne(
            { _id: user._id },
            {
              $push: {
                deviceHistory: {
                  fingerprintHash: user.registeredDevice.fingerprintHash,
                  deviceName:      user.registeredDevice.deviceInfo,
                  platform:        user.registeredDevice.platform,
                  registeredAt:    user.registeredDevice.registeredAt,
                  revokedAt:       new Date(),
                  revokedBy:       new mongoose.Types.ObjectId(reviewedBy),
                  revokedReason:   'replacement',
                },
              },
            },
            { session: mongoSession },
          );

          // Revoke all existing sessions
          await DeviceSession.updateMany(
            { employeeId: user._id, isRevoked: false },
            { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'device-change' } },
            { session: mongoSession },
          );
        }

        // Set new device — use fingerprintHash directly (already hashed)
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              registeredDevice: {
                fingerprintHash: request.fingerprintHash,
                registeredAt:    new Date(),
                deviceInfo:      request.deviceName,
                platform:        request.platform,
              },
            },
          },
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }

    await AuditLog.create([
      {
        performedBy: new mongoose.Types.ObjectId(reviewedBy),
        action: 'DEVICE_REQUEST_APPROVED',
        targetType: 'DeviceRequest',
        targetId: requestId,
      },
      {
        performedBy: new mongoose.Types.ObjectId(reviewedBy),
        action: 'DEVICE_REGISTERED',
        targetType: 'User',
        targetId: String(request.userId),
        changes: { deviceName: request.deviceName, type: request.type },
      },
    ]);

    return { message: 'Device request approved. Employee can now sign in.' };
  }

  static async rejectRequest(
    requestId: string,
    reviewedBy: string,
    rejectionReason: string,
  ) {
    await connectDB();

    const request = await DeviceRequest.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      {
        $set: {
          status:          'rejected',
          reviewedAt:      new Date(),
          reviewedBy:      new mongoose.Types.ObjectId(reviewedBy),
          rejectionReason,
        },
      },
      { new: true },
    );
    if (!request) throw new AppError('GEN_002', 404, 'Device request not found or already reviewed.');

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(reviewedBy),
      action: 'DEVICE_REQUEST_REJECTED',
      targetType: 'DeviceRequest',
      targetId: requestId,
      changes: { rejectionReason },
    });

    return { message: 'Device request rejected.' };
  }

  static async listRequests(query: {
    status?: 'pending' | 'approved' | 'rejected';
    page: number;
    limit: number;
    search?: string;
    userId?: string;
  }) {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.userId) filter.userId = new mongoose.Types.ObjectId(query.userId);
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filter.$or = [{ email: re }, { deviceName: re }, { manufacturer: re }];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      DeviceRequest.find(filter)
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      DeviceRequest.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  static async listRegisteredDevices(query: {
    page: number;
    limit: number;
    search?: string;
  }) {
    await connectDB();

    const filter: Record<string, unknown> = { registeredDevice: { $ne: null } };
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filter.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { 'registeredDevice.deviceInfo': re },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      User.find(filter)
        .select('firstName lastName email registeredDevice')
        .sort({ 'registeredDevice.registeredAt': -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  static async getDeviceHistory(userId: string) {
    await connectDB();

    const user = await User.findById(userId)
      .select('deviceHistory registeredDevice')
      .lean();
    if (!user) throw new AppError('GEN_002', 404, 'Employee not found.');

    return {
      registeredDevice: user.registeredDevice ?? null,
      deviceHistory:    user.deviceHistory ?? [],
    };
  }

  static async countPendingRequests() {
    await connectDB();
    return DeviceRequest.countDocuments({ status: 'pending' });
  }

  private static async _notifyAdmins(
    employeeName: string,
    employeeEmail: string,
    type: 'first_device' | 'replacement',
  ) {
    const admins = await User.find({ role: 'admin', isActive: true })
      .select('email firstName')
      .lean();

    const appUrl = getAppUrl();
    const label = type === 'replacement' ? 'replacement device' : 'device registration';
    const html = `
<p>Hello,</p>
<p><strong>${employeeName}</strong> (${employeeEmail}) has submitted a <strong>${label}</strong> request.</p>
<p><a href="${appUrl}/devices/requests">Review the request in the admin portal →</a></p>
`;

    await Promise.allSettled(
      admins.map((admin) =>
        sendEmail({
          to: { email: admin.email, name: admin.firstName },
          subject: `Device Request — ${employeeName}`,
          htmlContent: html,
        }),
      ),
    );
  }
}
