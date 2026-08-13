"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function AdminLoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { detail?: string };

      if (!response.ok) {
        throw new Error(body.detail ?? "Не удалось войти.");
      }

      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-login-card" onSubmit={submit}>
      <p className="mono-label">SaleTracker / защищённый контур</p>
      <h1>Вход в редакцию</h1>
      <p>
        Управление источниками, выпуском и отправкой Telegram доступно только
        администратору.
      </p>
      <label>
        Пароль администратора
        <input
          autoComplete="current-password"
          disabled={!configured || pending}
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="admin-login-error">{error}</p> : null}
      {!configured ? (
        <p className="admin-login-error">
          На сервере не заданы ADMIN_PASSWORD и SESSION_SECRET.
        </p>
      ) : null}
      <button
        className="button button-signal"
        disabled={!configured || pending}
        type="submit"
      >
        {pending ? "Проверяем…" : "Войти в редакцию"}
      </button>
    </form>
  );
}
