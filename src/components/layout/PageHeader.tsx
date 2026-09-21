import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";
import { Header } from "./Header";

/** 인증 후 화면의 표준 헤더. 세션에서 매니저/매장명과 로그아웃을 채운다. */
export async function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  const { manager, store } = await requireManager();

  return (
    <Header
      title={title}
      managerName={manager.name}
      storeName={store.name}
      actions={
        <>
          {actions}
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              로그아웃
            </Button>
          </form>
        </>
      }
    />
  );
}
