import { readFileSync } from 'fs';
import { join } from 'path';

type TemplateVars = Record<string, string>;

function renderTemplate(name: string, vars: TemplateVars): string {
  const html = readFileSync(join(__dirname, `${name}.html`), 'utf-8');
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export const templates = {
  welcome: (vars: { name: string; loginUrl: string }) =>
    renderTemplate('welcome', vars),
  leaveApproved: (vars: { name: string; startDate: string; endDate: string }) =>
    renderTemplate('leave-approved', vars),
  leaveRejected: (vars: { name: string; startDate: string; reason: string }) =>
    renderTemplate('leave-rejected', vars),
  payrollReminder: (vars: { name: string; month: string }) =>
    renderTemplate('payroll-reminder', vars),
  passwordReset: (vars: { name: string; resetUrl: string }) =>
    renderTemplate('password-reset', vars),
};
