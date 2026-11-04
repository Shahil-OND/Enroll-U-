// pages/LoginPage.jsx — Modern authentication view with Cognito support
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, signup, completeNewPassword, loginWithCognitoHostedUI, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Password reset challenge state (NEW_PASSWORD_REQUIRED)
  const [challenge, setChallenge] = useState(null);
  const [newPermanentPassword, setNewPermanentPassword] = useState('');

  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;

  // Destination after login
  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (challenge) {
        await completeNewPassword(newPermanentPassword, challenge.session, challenge.email);
        navigate(from, { replace: true });
        return;
      }

      if (mode === 'signin') {
        const res = await login(email, password, rememberMe);
        if (res?.challenge === 'NEW_PASSWORD_REQUIRED') {
          setChallenge(res);
          return;
        }
      } else {
        await signup(name, email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    }
  };

  const autofillDemo = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f8f9fb 0%, #e8f0fe 50%, #f1f3f9 100%)',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative backdrop glow circles */}
      <div style={{
        position: 'absolute',
        top: -100,
        right: -100,
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(13,110,253,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: -120,
        left: -100,
        width: 450,
        height: 450,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(108,92,231,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Main Login Card */}
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.12), 0 0 0 1px var(--border)',
        padding: '36px 32px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
            color: 'white',
            borderRadius: 14,
            fontWeight: 800,
            fontSize: 20,
            boxShadow: '0 8px 18px -4px rgba(13, 110, 253, 0.4)',
            marginBottom: 14,
          }}>
            EU
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
            Enroll<span style={{ color: 'var(--primary)' }}>-U</span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
            Document Intelligence Bridge & Review Portal
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div style={{
          display: 'flex',
          background: 'var(--surface-alt)',
          padding: 4,
          borderRadius: 'var(--radius-sm)',
          marginBottom: 24,
          border: '1px solid var(--border)',
        }}>
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === 'signin' ? 'white' : 'transparent',
              color: mode === 'signin' ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: mode === 'signin' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === 'signup' ? 'white' : 'transparent',
              color: mode === 'signup' ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: mode === 'signup' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--status-rejected-bg)',
            color: 'var(--status-rejected)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 20,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        {/* Auth Form */}
        {challenge ? (
          <form onSubmit={handleSubmit}>
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              fontSize: 13,
              color: '#1e40af',
              marginBottom: 18,
            }}>
              <b>First-time login:</b> An initial temporary password was used. Please choose a permanent password for <b>{challenge.email}</b>.
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                New Permanent Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Min. 8 characters (uppercase, lowercase, number)"
                  value={newPermanentPassword}
                  onChange={(e) => setNewPermanentPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 38px 10px 38px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-light)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                color: 'white',
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {loading ? <span>Setting Password…</span> : (
                <>
                  <span>Set Password & Enter Portal</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
                <input
                  type="text"
                  required
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    outline: 'none',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>
          )}

          {/* Email field */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                type="email"
                required
                placeholder="operator@enroll-u.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>

          {/* Password field */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                Password
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => alert('Password reset is managed via AWS Cognito or your system administrator.')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: 11,
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 38px 10px 38px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-light)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Remember me option */}
          {mode === 'signin' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
              <label htmlFor="remember" style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Keep me signed in for 30 days
              </label>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(13, 110, 253, 0.35)',
              transition: 'transform 0.1s ease, box-shadow 0.15s ease',
            }}
            onMouseDown={(e) => !loading && (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={(e) => !loading && (e.currentTarget.style.transform = 'scale(1)')}
          >
            {loading ? (
              <span>Authenticating…</span>
            ) : (
              <>
                <span>{mode === 'signin' ? 'Sign In to Portal' : 'Create Operator Account'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Cognito Hosted UI / Managed Login Alternative */}
          {cognitoDomain && (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                onClick={loginWithCognitoHostedUI}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-alt)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
                <span>Sign in via Cognito Managed Login</span>
              </button>
            </div>
          )}
        </form>
        )}

        {/* Quick Demo Credentials Pill */}
        <div style={{
          marginTop: 24,
          padding: '12px 14px',
          background: 'var(--surface-alt)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
            <Sparkles size={13} style={{ color: 'var(--primary)' }} />
            <span>QUICK DEMO ACCESS</span>
          </div>
          <button
            type="button"
            onClick={() => autofillDemo('operator@enroll-u.com', 'AdminPass123!')}
            style={{
              background: 'white',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--primary)',
              cursor: 'pointer',
            }}
          >
            Auto-fill demo operator credentials
          </button>
        </div>

        {/* Security footer badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 22,
          fontSize: 11,
          color: 'var(--text-light)',
        }}>
          <ShieldCheck size={14} style={{ color: 'var(--accent-green)' }} />
          <span>Secured with AWS Cognito & 256-bit SSL</span>
        </div>
      </div>
    </div>
  );
}

