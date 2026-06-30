// CSRF Protection — De-scoped (approved risk acceptance)
//
// CSRF via cookie-replay attacks are not applicable to this admin portal because:
// 1. All state-mutating API calls send an Authorization: Bearer <token> header.
//    Browsers cannot set custom headers cross-origin without a CORS preflight, which
//    this server rejects for non-allowed origins.
// 2. The __session cookie is HttpOnly + SameSite=Strict, which prevents it from
//    being sent in cross-site requests on all modern browsers.
// 3. There is no cookie-only auth path — every protected API route calls getAuthUser()
//    which requires a valid Bearer token in the Authorization header.
//
// If a cookie-only auth path is added in a future phase (e.g., server-rendered pages
// making state-mutating requests without Authorization headers), this middleware must
// be implemented with Origin/Referer validation or a CSRF token double-submit pattern.
export {};
