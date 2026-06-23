import { useState } from "react";

type Props = {
  onLogin: (username: string) => void;
  apiBase?: string;
};

export default function Login({ onLogin, apiBase = "http://localhost:4000" }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) return setError(data.error || "Login failed");

      onLogin(username);
    } catch (err: any) {
      setError(err.message || "Network error");
    }
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <h2>Login</h2>
      {error && <p className="error">{error}</p>}
      <label>Username<input value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <div style={{display: 'flex', gap: 8}}>
        <button type="submit">Log in</button>
      </div>
    </form>
  );
}
