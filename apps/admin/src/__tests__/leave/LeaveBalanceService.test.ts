import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';

Object.defineProperty(mongoose.connection, 'readyState', { get: () => 1, configurable: true });

import { LeaveBalanceService } from '@services/LeaveBalanceService';
import { User } from '@models/User';
import { CompanySettings } from '@models/CompanySettings';
import { LeaveYearAllocation } from '@models/LeaveYearAllocation';
import { LeaveTransaction } from '@models/LeaveTransaction';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMP_ID  = new mongoose.Types.ObjectId();
const EMP_ID2 = new mongoose.Types.ObjectId();

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    leaveYearStartMonth: 1,
    timezone: 'Asia/Kolkata',
    leaveTypes: {
      paidLeave:   { annualAllocation: 12, carryForward: { enabled: true,  maxDays: 5, expiryMonths: 3 }, encashable: false },
      sickLeave:   { annualAllocation: 8,  carryForward: { enabled: false, maxDays: 0, expiryMonths: 0 }, encashable: false },
      casualLeave: { annualAllocation: 6,  carryForward: { enabled: false, maxDays: 0, expiryMonths: 0 }, encashable: false },
    },
    ...overrides,
  };
}

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    _id:      EMP_ID,
    isActive: true,
    dateOfJoining: new Date('2020-01-01'),
    leaveBalances: {
      paidLeave:   { currentYear: 0, carriedForward: 0 },
      sickLeave:   { currentYear: 0, carriedForward: 0 },
      casualLeave: { currentYear: 0, carriedForward: 0 },
    },
    ...overrides,
  };
}

function mockTransaction() {
  const session = {
    withTransaction: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
    endSession:      jest.fn().mockResolvedValue(undefined),
  };
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as unknown as mongoose.ClientSession);
  return session;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.restoreAllMocks();

  jest.spyOn(CompanySettings, 'findById').mockReturnValue({
    lean: jest.fn().mockResolvedValue(makeSettings()),
  } as unknown as ReturnType<typeof CompanySettings.findById>);
});

// ─── allocateLeaveYear ────────────────────────────────────────────────────────

describe('U-LBS-01: allocateLeaveYear() — full allocation (non-pro-rated)', () => {
  it('creates LeaveYearAllocation and LeaveTransaction for each leave type', async () => {
    mockTransaction();
    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([makeEmployee()]),
    } as unknown as ReturnType<typeof User.find>);

    const allocSpy = jest.spyOn(LeaveYearAllocation, 'create').mockResolvedValue({} as never);
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    const txSpy = jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    const result = await LeaveBalanceService.allocateLeaveYear(2026);

    expect(allocSpy).toHaveBeenCalledTimes(3); // paidLeave + sickLeave + casualLeave
    expect(txSpy).toHaveBeenCalledTimes(3);
    expect(result.allocated).toBe(3);
    expect(result.skipped).toBe(0);
  });
});

describe('U-LBS-02: allocateLeaveYear() — pro-ration for mid-year joiner', () => {
  it('allocates fewer days for employee who joined after leave year start', async () => {
    mockTransaction();
    // Employee joined Jul 1 — halfway through Jan-Dec year
    const midYearEmployee = makeEmployee({ dateOfJoining: new Date('2026-07-01') });
    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([midYearEmployee]),
    } as unknown as ReturnType<typeof User.find>);

    const allocSpy = jest.spyOn(LeaveYearAllocation, 'create').mockResolvedValue({} as never);
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    await LeaveBalanceService.allocateLeaveYear(2026);

    // Check that isProRated = true and allocatedDays < annualAllocation
    const firstCall = allocSpy.mock.calls[0][0] as Array<{ isProRated: boolean; allocatedDays: number }>;
    expect(firstCall[0].isProRated).toBe(true);
    expect(firstCall[0].allocatedDays).toBeLessThan(12); // paidLeave annual = 12
  });
});

describe('U-LBS-03: allocateLeaveYear() — double-allocation idempotency (code 11000)', () => {
  it('skips employee-type combination that already has an allocation', async () => {
    mockTransaction();
    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([makeEmployee()]),
    } as unknown as ReturnType<typeof User.find>);

    // Simulate 11000 duplicate key error on create
    jest.spyOn(LeaveYearAllocation, 'create').mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: 11000 }),
    );
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    const result = await LeaveBalanceService.allocateLeaveYear(2026);

    expect(result.allocated).toBe(0);
    expect(result.skipped).toBe(3); // 3 leave types skipped
  });
});

describe('U-LBS-04: allocateLeaveYear() — zero allocation when annualAllocation = 0', () => {
  it('creates allocation with 0 days when config has annualAllocation 0', async () => {
    mockTransaction();
    jest.spyOn(CompanySettings, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(makeSettings({
        leaveTypes: {
          paidLeave:   { annualAllocation: 0, carryForward: { enabled: false, maxDays: 0, expiryMonths: 0 }, encashable: false },
          sickLeave:   { annualAllocation: 0, carryForward: { enabled: false, maxDays: 0, expiryMonths: 0 }, encashable: false },
          casualLeave: { annualAllocation: 0, carryForward: { enabled: false, maxDays: 0, expiryMonths: 0 }, encashable: false },
        },
      })),
    } as unknown as ReturnType<typeof CompanySettings.findById>);

    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([makeEmployee()]),
    } as unknown as ReturnType<typeof User.find>);

    const allocSpy = jest.spyOn(LeaveYearAllocation, 'create').mockResolvedValue({} as never);
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    await LeaveBalanceService.allocateLeaveYear(2026);

    const firstCall = allocSpy.mock.calls[0][0] as Array<{ allocatedDays: number }>;
    expect(firstCall[0].allocatedDays).toBe(0);
  });
});

// ─── processCarryForwardExpiry ────────────────────────────────────────────────

describe('U-LBS-05: processCarryForwardExpiry() — zeroes expired carriedForward', () => {
  it('calls User.findByIdAndUpdate and creates carry-forward-expiry transaction', async () => {
    mockTransaction();
    const expiredEmployee = makeEmployee({
      leaveBalances: {
        paidLeave: {
          currentYear: 5,
          carriedForward: 3,
          carryForwardExpiry: new Date('2026-03-31'),
        },
        sickLeave:   { currentYear: 8, carriedForward: 0 },
        casualLeave: { currentYear: 6, carriedForward: 0 },
      },
    });

    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([expiredEmployee]),
    } as unknown as ReturnType<typeof User.find>);

    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    const txSpy = jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    const result = await LeaveBalanceService.processCarryForwardExpiry('2026-04-01');

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(txSpy).toHaveBeenCalledTimes(1);

    const txArg = (txSpy.mock.calls[0][0] as Array<{ transactionType: string; days: number }>)[0];
    expect(txArg.transactionType).toBe('carry-forward-expiry');
    expect(txArg.days).toBe(-3); // expired 3 days

    expect(result.processed).toBe(1);
  });
});

describe('U-LBS-06: processCarryForwardExpiry() — skips non-expired CF', () => {
  it('does not process employee with future expiry', async () => {
    mockTransaction();
    // No employees returned because $lte filter wouldn't match future expiry
    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof User.find>);

    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);

    const result = await LeaveBalanceService.processCarryForwardExpiry('2026-01-01');

    expect(updateSpy).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });
});

// ─── creditCarryForward ───────────────────────────────────────────────────────

describe('U-LBS-07: creditCarryForward() — respects maxDays cap', () => {
  it('credits at most maxDays even when currentYear > maxDays', async () => {
    mockTransaction();
    const richEmployee = makeEmployee({
      leaveBalances: {
        paidLeave:   { currentYear: 20, carriedForward: 0 },
        sickLeave:   { currentYear: 8,  carriedForward: 0 },
        casualLeave: { currentYear: 6,  carriedForward: 0 },
      },
    });

    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([richEmployee]),
    } as unknown as ReturnType<typeof User.find>);

    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    const settings = makeSettings() as ReturnType<typeof makeSettings> & { leaveYearStartMonth: number };
    await LeaveBalanceService.creditCarryForward(2025, 2026, settings as never);

    // paidLeave maxDays = 5, currentYear = 20 → should credit exactly 5
    const updateArg = updateSpy.mock.calls[0][1] as { $inc: Record<string, number> };
    expect(updateArg.$inc['leaveBalances.paidLeave.carriedForward']).toBe(5);
  });
});

describe('U-LBS-08: creditCarryForward() — skips leave types with carryForward disabled', () => {
  it('only credits paidLeave (enabled), skips sickLeave and casualLeave (disabled)', async () => {
    mockTransaction();
    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([makeEmployee({
        leaveBalances: {
          paidLeave:   { currentYear: 10, carriedForward: 0 },
          sickLeave:   { currentYear: 8,  carriedForward: 0 },
          casualLeave: { currentYear: 6,  carriedForward: 0 },
        },
      })]),
    } as unknown as ReturnType<typeof User.find>);

    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    const settings = makeSettings();
    await LeaveBalanceService.creditCarryForward(2025, 2026, settings as never);

    // Only paidLeave has carryForward.enabled = true → 1 update
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── Pro-ration boundary ──────────────────────────────────────────────────────

describe('U-LBS-09: allocateLeaveYear() — employee who joined before leave year start is NOT pro-rated', () => {
  it('isProRated = false for employee with dateOfJoining before leave year start', async () => {
    mockTransaction();
    // Employee joined in prior year — not pro-rated for 2026
    const veteran = makeEmployee({ dateOfJoining: new Date('2023-06-01') });
    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([veteran]),
    } as unknown as ReturnType<typeof User.find>);

    const allocSpy = jest.spyOn(LeaveYearAllocation, 'create').mockResolvedValue({} as never);
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    await LeaveBalanceService.allocateLeaveYear(2026);

    const firstCall = allocSpy.mock.calls[0][0] as Array<{ isProRated: boolean; allocatedDays: number }>;
    expect(firstCall[0].isProRated).toBe(false);
    expect(firstCall[0].allocatedDays).toBe(12); // full paidLeave allocation
  });
});

describe('U-LBS-10: allocateLeaveYear() — multiple employees processed independently', () => {
  it('allocates for all active employees', async () => {
    mockTransaction();
    const emp1 = makeEmployee({ _id: EMP_ID });
    const emp2 = makeEmployee({ _id: EMP_ID2 });

    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([emp1, emp2]),
    } as unknown as ReturnType<typeof User.find>);

    jest.spyOn(LeaveYearAllocation, 'create').mockResolvedValue({} as never);
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as never);
    jest.spyOn(LeaveTransaction, 'create').mockResolvedValue([] as never);

    const result = await LeaveBalanceService.allocateLeaveYear(2026);

    expect(result.allocated).toBe(6); // 2 employees × 3 leave types
  });
});
