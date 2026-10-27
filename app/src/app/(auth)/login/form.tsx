"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { Button, Input, Label } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={pending} className="w-full">
        Entrar
      </Button>
    </form>
  );
}
