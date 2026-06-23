import { useState } from "react";

type Props = {
  onRegistered: (username: string) => void;
  apiBase?: string;
};

export default function Register({ onRegistered, apiBase = "http://localhost:4000" }: Props) {
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("");
  const [birthday, setBirthday] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (password !== repeat) return setError("Passwords do not match");

    try {
      const res = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, nickname, avatar, birthday, password })
      });

      const data = await res.json();
      if (!res.ok) return setError(data.error || "Registration failed");

      onRegistered(username);
    } catch (err: any) {
      setError(err.message || "Network error");
    }
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <h2>Register</h2>
      {error && <p className="error">{error}</p>}
      <label>Username<input value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Nickname<input value={nickname} onChange={e => setNickname(e.target.value)} /></label>
      <label>Avatar URL<input value={avatar} onChange={e => setAvatar(e.target.value)} /></label>
      <label>Birthday<input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Repeat Password<input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} /></label>
      <div style={{display: 'flex', gap: 8}}>
        <button type="submit">Create account</button>
      </div>
    </form>
  );
}
