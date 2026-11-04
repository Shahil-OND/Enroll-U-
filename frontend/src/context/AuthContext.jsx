// context/AuthContext.jsx — Real Amazon Cognito Authentication & Session Manager
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const AUTH_STORAGE_KEY = 'enrollu_auth_user';
const TOKEN_STORAGE_KEY = 'enrollu_auth_token';
const REFRESH_TOKEN_KEY = 'enrollu_auth_refresh_token';

// Helper to decode JWT token payload safely in the browser
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// Extracts user profile and role from Cognito token claims
function extractUserFromClaims(claims, fallbackEmail = '') {
  if (!claims) return null;

  const email = claims.email || claims['cognito:username'] || fallbackEmail;
  const groups = claims['cognito:groups'] || [];
  const groupList = Array.isArray(groups) ? groups : [groups];

  // Role: Administrator or Operator
  const isAdmin = groupList.some((g) => g.toLowerCase() === 'administrator' || g.toLowerCase() === 'admin');
  const role = isAdmin ? 'Administrator' : 'Operator';

  return {
    sub: claims.sub || 'anonymous',
    email: email.toLowerCase(),
    name: claims.name || claims.given_name || email.split('@')[0].replace('.', ' '),
    role,
    groups: groupList,
    lastLogin: new Date().toISOString(),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY) || null;
  });

  const [loading, setLoading] = useState(false);

  // Sync token to window for instant access by Axios interceptors
  useEffect(() => {
    if (token) {
      window.__ENROLLU_AUTH_TOKEN__ = token;
    } else {
      delete window.__ENROLLU_AUTH_TOKEN__;
    }
  }, [token]);

  // Handle Cognito Hosted UI OAuth Redirect (Code Exchange with PKCE)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const domain = import.meta.env.VITE_COGNITO_DOMAIN;
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

    if (code && domain && clientId) {
      const codeVerifier = sessionStorage.getItem('enrollu_pkce_verifier');
      const redirectUri = window.location.origin + window.location.pathname;

      setLoading(true);
      const tokenUrl = `https://${domain}/oauth2/token`;
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      });

      fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.id_token || data.access_token) {
            const jwtToken = data.id_token || data.access_token;
            const claims = parseJwt(jwtToken);
            const userProfile = extractUserFromClaims(claims);

            localStorage.setItem(TOKEN_STORAGE_KEY, jwtToken);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile));
            if (data.refresh_token) {
              localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
            }

            setUser(userProfile);
            setToken(jwtToken);
            // Clean up query param
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        })
        .catch((err) => {
          console.error('[Cognito] PKCE code exchange failed:', err);
        })
        .finally(() => {
          sessionStorage.removeItem('enrollu_pkce_verifier');
          setLoading(false);
        });
    }
  }, []);

  /**
   * Log in using Amazon Cognito User Pools (Direct API) or development mock fallback
   */
  const login = useCallback(async (email, password, rememberMe = true) => {
    setLoading(true);
    try {
      if (!email || !password) {
        throw new Error('Please enter both email and password.');
      }

      const cognitoUserPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
      const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
      const cognitoRegion = import.meta.env.VITE_COGNITO_REGION || 'us-west-2';

      // ── AWS Cognito Real Authentication Flow ─────────────────────────────
      if (cognitoClientId && cognitoUserPoolId) {
        const endpoint = `https://cognito-idp.${cognitoRegion}.amazonaws.com/`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
          },
          body: JSON.stringify({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: cognitoClientId,
            AuthParameters: {
              USERNAME: email.trim(),
              PASSWORD: password,
            },
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const message = data.message || data.__type || 'Authentication failed.';
          if (message.includes('NotAuthorizedException')) {
            throw new Error('Incorrect username or password.');
          } else if (message.includes('UserNotFoundException')) {
            throw new Error('User does not exist.');
          } else if (message.includes('PasswordResetRequiredException')) {
            throw new Error('Password reset is required. Please contact your administrator.');
          }
          throw new Error(message);
        }

        if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
          return {
            challenge: 'NEW_PASSWORD_REQUIRED',
            session: data.Session,
            email: email.trim(),
          };
        }

        const authResult = data.AuthenticationResult;
        if (!authResult || !authResult.IdToken) {
          throw new Error('No authentication token returned by Cognito.');
        }

        const jwtToken = authResult.IdToken;
        const claims = parseJwt(jwtToken);
        const userProfile = extractUserFromClaims(claims, email);

        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile));
        storage.setItem(TOKEN_STORAGE_KEY, jwtToken);
        if (authResult.RefreshToken) {
          storage.setItem(REFRESH_TOKEN_KEY, authResult.RefreshToken);
        }

        setUser(userProfile);
        setToken(jwtToken);
        return { success: true, user: userProfile };
      }

      // ── Standalone / Local Mock Fallback (when Cognito env is absent) ───
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const isAdmin = email.toLowerCase().includes('admin');
      const mockUser = {
        sub: 'mock-sub-' + Math.random().toString(36).substring(2, 9),
        email: email.trim().toLowerCase(),
        name: email.split('@')[0].replace('.', ' '),
        role: isAdmin ? 'Administrator' : 'Operator',
        groups: [isAdmin ? 'Administrator' : 'Operator'],
        lastLogin: new Date().toISOString(),
      };
      const mockToken = `mock-cognito-jwt-${Date.now()}-${btoa(email)}`;

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockUser));
      storage.setItem(TOKEN_STORAGE_KEY, mockToken);

      setUser(mockUser);
      setToken(mockToken);
      return { success: true, user: mockUser };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Responds to NEW_PASSWORD_REQUIRED challenge when user is forced to set permanent password
   */
  const completeNewPassword = useCallback(async (newPassword, session, email) => {
    setLoading(true);
    try {
      if (!newPassword || newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters.');
      }

      const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
      const cognitoRegion = import.meta.env.VITE_COGNITO_REGION || 'us-west-2';
      const endpoint = `https://cognito-idp.${cognitoRegion}.amazonaws.com/`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
        },
        body: JSON.stringify({
          ChallengeName: 'NEW_PASSWORD_REQUIRED',
          ClientId: cognitoClientId,
          ChallengeResponses: {
            USERNAME: email,
            NEW_PASSWORD: newPassword,
          },
          Session: session,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.__type || 'Failed to set new permanent password.');
      }

      const authResult = data.AuthenticationResult;
      if (!authResult || !authResult.IdToken) {
        throw new Error('No authentication token returned after password update.');
      }

      const jwtToken = authResult.IdToken;
      const claims = parseJwt(jwtToken);
      const userProfile = extractUserFromClaims(claims, email);

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile));
      localStorage.setItem(TOKEN_STORAGE_KEY, jwtToken);
      if (authResult.RefreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, authResult.RefreshToken);
      }

      setUser(userProfile);
      setToken(jwtToken);
      return { success: true, user: userProfile };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Redirect to Cognito Managed Login / Hosted UI
   */
  const loginWithCognitoHostedUI = useCallback(async () => {
    const domain = import.meta.env.VITE_COGNITO_DOMAIN;
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
    if (!domain || !clientId) {
      throw new Error('Cognito Hosted UI is not configured. Missing VITE_COGNITO_DOMAIN or VITE_COGNITO_CLIENT_ID.');
    }

    // Generate standard PKCE code verifier and challenge
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    const verifier = Array.from(array, (dec) => ('0' + dec.toString(16)).substr(-2)).join('');
    sessionStorage.setItem('enrollu_pkce_verifier', verifier);

    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const redirectUri = window.location.origin + '/login';
    const authUrl = `https://${domain}/login?client_id=${clientId}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&code_challenge=${challenge}&code_challenge_method=S256`;

    window.location.href = authUrl;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    delete window.__ENROLLU_AUTH_TOKEN__;
    setUser(null);
    setToken(null);

    // If Hosted UI logout is desired:
    const domain = import.meta.env.VITE_COGNITO_DOMAIN;
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
    if (domain && clientId) {
      const logoutRedirect = window.location.origin + '/login';
      window.location.href = `https://${domain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(
        logoutRedirect
      )}`;
    }
  }, []);

  const isAdmin = user?.role === 'Administrator' || (user?.groups && user.groups.includes('Administrator'));
  const isOperator = user?.role === 'Operator' || (user?.groups && user.groups.includes('Operator'));

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isAdmin,
        isOperator,
        loading,
        login,
        completeNewPassword,
        loginWithCognitoHostedUI,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
