// Install @vercel/config when Vercel CLI is set up: npm i -D @vercel/config
// import { type VercelConfig } from '@vercel/config/v1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const config: any = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/session-auto-close',        schedule: '0 18 * * *'      },
    { path: '/api/cron/leave-year-allocation',     schedule: '35 18 28-31 * *' },
    { path: '/api/cron/leave-carryforward-expiry', schedule: '35 18 28-31 * *' },
    { path: '/api/cron/attendance-reminder',       schedule: '0 5 * * 1-5'     },
    { path: '/api/cron/checkout-reminder',         schedule: '0 13 * * 1-5'    },
    { path: '/api/cron/payroll-month-end',         schedule: '30 3 28-31 * *'  },
  ],
};
