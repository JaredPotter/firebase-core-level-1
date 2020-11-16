import React from 'react';
import FirebaseAuthService from '../FirebaseAuthService';

function LoginForm({ existingUser }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    setUser(existingUser);
  }, [existingUser]);

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      const authResponse = await FirebaseAuthService.loginUser(
        username,
        password
      );

      setUser(authResponse.user);
    } catch (error) {
      alert(error.message);
      throw error;
    }

    setUsername('');
    setPassword('');
  }

  function handleLogout() {
    FirebaseAuthService.logoutUser();
    setUser(null);
  }

  async function handleSendPasswordResetEmail() {
    if (!username) {
      alert('Missing username/email');
      return;
    }

    try {
      await FirebaseAuthService.sendResetPassword(username);
      alert('Reset Email Sent');
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleLoginWithGoogle() {
    try {
      const loginResult = await FirebaseAuthService.loginWithGoogle();

      const user = loginResult.user;

      setUser(user);
    } catch (error) {
      alert(error.message);
      throw error;
    }
  }

  return (
    <div className="login-form-container">
      {user ? (
        <div className="row">
          <h3>Welcome, {user.email}</h3>
          <button onClick={handleLogout} className="primary-button">
            Logout
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="login-form">
            <label className="input-label login-label">
              Username (email):
              <input
                type="email"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-text"
              />
            </label>
            <label className="input-label login-label">
              Password:
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-text"
              />
            </label>
            <div className="button-box">
              <button type="submit" className="primary-button">
                Login
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSendPasswordResetEmail}
              >
                Reset Email
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleLoginWithGoogle}
              >
                Login with Google
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default LoginForm;
