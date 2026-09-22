import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card, CardGrid, Table, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui";
import { requireManager, scopeToStore } from "@/lib/auth";
import { MANAGER_ROLE_LABEL, type ManagerRole } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

const ROLE_TONE = {
  MANAGER: "neutral",
  STORE_ADMIN: "info",
  HQ: "success",
} as const;

function RoleBadge({ role }: { role: ManagerRole }) {
  return (
    <Badge tone={ROLE_TONE[role]} showIcon={false}>
      {MANAGER_ROLE_LABEL[role]}
    </Badge>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-24 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="min-w-0 break-words text-body text-gray-900">{value ?? "-"}</dd>
    </div>
  );
}

export default async function StorePage() {
  const ctx = await requireManager();
  const { manager, store } = ctx;

  const [colleagues, handovers] = await Promise.all([
    prisma.manager.findMany({
      where: { ...scopeToStore(ctx), active: true },
      orderBy: [{ role: "asc" }, { employeeNo: "asc" }],
      select: {
        id: true,
        name: true,
        employeeNo: true,
        role: true,
        phone: true,
        duty: true,
        store: { select: { name: true } },
      },
    }),
    prisma.consultation.findMany({
      where: { ...scopeToStore(ctx), assignedManagerId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        customer: { select: { name: true } },
        manager: { select: { name: true } },
        assignedManager: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader title="매장 및 매니저 정보" />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <CardGrid>
            <Card title="소속 매장 정보" className="col-span-12 lg:col-span-7">
              <dl className="divide-y divide-gray-200">
                <Field label="매장명" value={store.name} />
                <Field label="매장코드" value={store.code} />
                <Field label="주소" value={store.address} />
                <Field label="대표전화" value={store.phone} />
                <Field label="운영시간" value={`${store.openTime} ~ ${store.closeTime}`} />
                <Field label="휴무" value={store.holidays ?? "연중무휴"} />
                <Field
                  label="위치"
                  value={
                    store.lat != null && store.lng != null ? (
                      <span className="tabular-nums">
                        위도 {store.lat.toFixed(6)} / 경도 {store.lng.toFixed(6)}
                      </span>
                    ) : (
                      "-"
                    )
                  }
                />
              </dl>
            </Card>

            <Card title="담당 매니저 정보" className="col-span-12 lg:col-span-5">
              <dl className="divide-y divide-gray-200">
                <Field label="이름" value={manager.name} />
                <Field
                  label="사번"
                  value={<span className="tabular-nums">{manager.employeeNo}</span>}
                />
                <Field label="역할" value={<RoleBadge role={ctx.role} />} />
                <Field label="담당업무" value={manager.duty} />
                <Field label="연락처" value={manager.phone} />
                <Field label="이메일" value={manager.email} />
              </dl>
            </Card>

            <Card title="매장 매니저 목록" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>이름</TH>
                    <TH>사번</TH>
                    <TH>역할</TH>
                    <TH>담당업무</TH>
                    <TH>연락처</TH>
                    {ctx.isHQ && <TH>매장</TH>}
                  </TR>
                </THead>
                <TBody>
                  {colleagues.length === 0 ? (
                    <TableEmpty colSpan={ctx.isHQ ? 6 : 5} />
                  ) : (
                    colleagues.map((row) => (
                      <TR key={row.id}>
                        <TD>{row.name}</TD>
                        <TD className="tabular-nums">{row.employeeNo}</TD>
                        <TD>
                          <RoleBadge role={row.role as ManagerRole} />
                        </TD>
                        <TD className="text-gray-700">{row.duty ?? "-"}</TD>
                        <TD className="tabular-nums text-gray-700">{row.phone ?? "-"}</TD>
                        {ctx.isHQ && <TD className="text-gray-700">{row.store.name}</TD>}
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="상담 배정 및 인수인계" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>고객</TH>
                    <TH>기존 담당</TH>
                    <TH>인수 담당</TH>
                    <TH>인수인계 메모</TH>
                  </TR>
                </THead>
                <TBody>
                  {handovers.length === 0 ? (
                    <TableEmpty colSpan={4}>인수인계된 상담이 없습니다.</TableEmpty>
                  ) : (
                    handovers.map((row) => (
                      <TR key={row.id}>
                        <TD>{row.customer.name}</TD>
                        <TD className="text-gray-700">{row.manager.name}</TD>
                        <TD>{row.assignedManager?.name ?? "-"}</TD>
                        <TD className="text-gray-700">{row.handoverNote ?? "-"}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
