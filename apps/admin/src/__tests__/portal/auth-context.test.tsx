/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import * as apiClient from '@lib/utils/api-client';

jest.mock('@lib/utils/api-client', () => ({
  apiFetch: jest.fn(),
  setAccessToken: jest.fn(),
  getSessionId: jest.fn(() => null),
  registerSessionExpiredHandler: jest.fn(),
  setSessionCredentials: jest.fn(),
  clearSessionCredentials: jest.fn(),
  tryRefresh: jest.fn(),
}));

function TestConsumer() {
  const { user, loading, sessionExpired } = useAuth();
  if (loading) return <div>loading</div>;
  if (sessionExpired) return <div>expired</div>;
  if (!user) return <div>logged-out</div>;
  return <div>logged-in:{user.firstName}</div>;
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthContext — initial load', () => {
  it('shows loading then logged-out when no session', async () => {
    (apiClient.tryRefresh as jest.Mock).mockResolvedValue(false);
    renderWithAuth();
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('logged-out')).toBeInTheDocument());
  });

  it('restores user when refresh token valid', async () => {
    (apiClient.tryRefresh as jest.Mock).mockResolvedValue(true);
    (apiClient.apiFetch as jest.Mock).mockResolvedValue({
      success: true,
      data: { _id: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'a@b.com', role: 'admin' },
    });
    renderWithAuth();
    await waitFor(() => expect(screen.getByText('logged-in:Alice')).toBeInTheDocument());
  });

  it('stays logged-out when refresh returns no token', async () => {
    (apiClient.tryRefresh as jest.Mock).mockResolvedValue(false);
    renderWithAuth();
    await waitFor(() => expect(screen.getByText('logged-out')).toBeInTheDocument());
  });
});

describe('AuthContext — login', () => {
  function LoginButton() {
    const { login } = useAuth();
    return (
      <button onClick={() => login('x@y.com', 'pass').catch(() => {})}>
        login
      </button>
    );
  }

  beforeEach(() => {
    (apiClient.tryRefresh as jest.Mock).mockResolvedValue(false);
  });

  it('calls apiFetch with login body', async () => {
    (apiClient.apiFetch as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        accessToken: 'tok',
        refreshToken: 'rt',
        sessionId: 'sid',
        employee: { _id: 'u1', firstName: 'Bob', lastName: 'Jones', email: 'b@c.com', role: 'admin', requiresPasswordChange: false },
      },
    });
    const { getByRole } = render(
      <AuthProvider>
        <LoginButton />
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('logged-out')).toBeInTheDocument());
    await act(async () => { getByRole('button').click(); });
    await waitFor(() => expect(screen.getByText('logged-in:Bob')).toBeInTheDocument());
    expect(apiClient.setAccessToken).toHaveBeenCalledWith('tok');
    expect(apiClient.setSessionCredentials).toHaveBeenCalledWith('rt', 'sid');
  });

  it('throws on failed login with error code', async () => {
    (apiClient.apiFetch as jest.Mock).mockResolvedValue({
      success: false,
      error: { code: 'AUTH_001', message: 'Invalid credentials' },
    });
    let caughtCode = '';
    function FailButton() {
      const { login } = useAuth();
      return (
        <button onClick={async () => {
          try { await login('a@b.com', 'wrong'); }
          catch (e: unknown) { caughtCode = (e as { code?: string }).code ?? ''; }
        }}>fail</button>
      );
    }
    const { getByRole } = render(<AuthProvider><FailButton /></AuthProvider>);
    await act(async () => { getByRole('button').click(); });
    await waitFor(() => expect(caughtCode).toBe('AUTH_001'));
  });
});

describe('AuthContext — logout', () => {
  it('clears user and token on logout', async () => {
    (apiClient.tryRefresh as jest.Mock).mockResolvedValue(true);
    (apiClient.apiFetch as jest.Mock)
      .mockResolvedValueOnce({
        success: true,
        data: { _id: 'u1', firstName: 'Carol', lastName: 'X', email: 'c@d.com', role: 'admin' },
      })
      .mockResolvedValueOnce({ success: true });

    function LogoutButton() {
      const { logout } = useAuth();
      return <button onClick={logout}>logout</button>;
    }
    render(
      <AuthProvider>
        <LogoutButton />
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('logged-in:Carol')).toBeInTheDocument());
    await act(async () => { screen.getByRole('button', { name: 'logout' }).click(); });
    await waitFor(() => expect(screen.getByText('logged-out')).toBeInTheDocument());
    expect(apiClient.setAccessToken).toHaveBeenCalledWith(null);
    expect(apiClient.clearSessionCredentials).toHaveBeenCalled();
  });
});
