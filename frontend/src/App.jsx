import { useState } from 'react'

import './App.css'


function App() {
  const [healthStatus, setHealthStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [college, setCollege] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [duplicateError, setDuplicateError] = useState(null);


  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  const checkHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${apiUrl}/api/health`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setHealthStatus(data)
    } catch (err) {
      setError(err.message || 'Failed to connect to backend')
      setHealthStatus(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <header className="header">
        <div className="badge">Phase 1: Foundation & Scaffolding</div>
        <h1>AI Growth Agent</h1>
        <p className="subtitle">
          Campaign Infrastructure & Health Monitoring
        </p>
      </header>

      <main className="main-content">
        <section className="card campaign-specs">
          <h2>Campaign Constraints</h2>
          <div className="specs-grid">
            <div className="spec-item">
              <span className="spec-label">Target Registrations</span>
              <span className="spec-value">500 Students</span>
              <span className="spec-note">Final-year engineering</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">Budget Limit</span>
              <span className="spec-value">₹2,000</span>
              <span className="spec-note">Strict expenditure cap</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">Duration</span>
              <span className="spec-value">7 Days</span>
              <span className="spec-note">Live workshop campaign</span>
            </div>
          </div>
        </section>

        <section className="card api-health">
          <h2>Backend Health Check</h2>
          <p className="description">
            Verifying connection to Express API endpoint (<code>GET /api/health</code>).
          </p>

          <div className="config-box">
            <div className="config-row">
              <span className="config-label">Configured API Base URL:</span>
              <code className="config-code">{apiUrl}</code>
            </div>
            <div className="config-row">
              <span className="config-label">Environment Source:</span>
              <code>{import.meta.env.VITE_API_URL ? 'VITE_API_URL (.env)' : 'Default Fallback'}</code>
            </div>
          </div>

          <div className="action-row">
            <button
              id="check-health-btn"
              type="button"
              className="btn btn-primary"
              onClick={checkHealth}
              disabled={loading}
            >
              {loading ? 'Pinging API...' : 'Check Backend Health'}
            </button>
          </div>

          {healthStatus && (
            <div className="status-box status-success" id="health-result-success">
              <span className="status-dot"></span>
              <div>
                <strong>Backend Online:</strong>
                <pre>{JSON.stringify(healthStatus, null, 2)}</pre>
              </div>
            </div>
          )}

          {error && (
            <div className="status-box status-error" id="health-result-error">
              <span className="status-dot"></span>
              <div>
                <strong>Connection Error:</strong>
                <p>{error}</p>
                <small>Ensure the backend server is running on {apiUrl}</small>
              </div>
            </div>
          )}
        </section>

        {/* Registration Form Section */}
        <section className="card registration-form">
          <h2>Register for "Build Your First AI Project in 60 Minutes"</h2>
          <p className="description">Join our free online workshop by providing your details below.</p>
          <form
            id="registration-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (submitLoading) return;
              setSubmitError(null);
              setSubmitSuccess(null);
              setDuplicateError(null);
              setSubmitLoading(true);
              try {
                const payload = { name, email, college, graduationYear };
                const response = await fetch(`${apiUrl}/api/registrations`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                if (response.status === 201) {
                  await response.json();
                  setSubmitSuccess('Registration successful! Thank you.');
                  setName('');
                  setEmail('');
                  setCollege('');
                  setGraduationYear('');
                } else if (response.status === 409) {
                  const err = await response.json();
                  setDuplicateError(err.error || 'This email is already registered.');
                } else if (response.status === 400) {
                  const err = await response.json();
                  setSubmitError(err.error ? `${err.error}: ${err.details?.join(', ')}` : 'Invalid registration data.');
                } else if (response.status === 503) {
                  setSubmitError('Service unavailable. Please try again later.');
                } else {
                  setSubmitError('Unexpected server error. Please try again later.');
                }
              } catch (networkErr) {
                setSubmitError('Network error. Please check your connection.');
              } finally {
                setSubmitLoading(false);
              }
            }}
          >
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required disabled={submitLoading} />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={submitLoading} />
            </div>
            <div className="form-group">
              <label htmlFor="college">College</label>
              <input id="college" type="text" value={college} onChange={(e) => setCollege(e.target.value)} required disabled={submitLoading} />
            </div>
            <div className="form-group">
              <label htmlFor="graduationYear">Graduation Year</label>
              <input id="graduationYear" type="number" min="2020" max="2035" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} required disabled={submitLoading} />
            </div>
            <div className="action-row">
              <button id="submit-registration-btn" type="submit" className="btn btn-primary" disabled={submitLoading}>
                {submitLoading ? 'Submitting...' : 'Register'}
              </button>
            </div>
          </form>
          {submitSuccess && (
            <div className="status-box status-success" id="registration-success"><span className="status-dot"></span><div>{submitSuccess}</div></div>
          )}
          {duplicateError && (
            <div className="status-box status-error" id="registration-duplicate"><span className="status-dot"></span><div>{duplicateError}</div></div>
          )}
          {submitError && (
            <div className="status-box status-error" id="registration-error"><span className="status-dot"></span><div>{submitError}</div></div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>AI Growth Agent &bull; Phase 1 Environment Verified</p>
      </footer>
    </div>
  )
}

export default App
