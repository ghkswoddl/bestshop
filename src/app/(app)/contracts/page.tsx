import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  CardGrid,
  Notice,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
  TextField,
} from "@/components/ui";
import { requireManager, scopeToStore } from "@/lib/auth";
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import {
  SIGNATURE_STALE_DAYS,
  currentSignatureRequest,
  signatureState,
} from "@/lib/contracts";
import { CONTRACT_STATUS } from "@/lib/enums";
import { formatDate, formatKRW } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ContractNoticeBanner, ContractStatusBadge, SignaturePhaseBadge } from "./_components/badges";

const RESULT_LIMIT = 100;

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const params = await searchParams;
  const q = pickOne(params, "q") ?? "";
  const status = pickOne(params, "status");
  const now = new Date();

  const rows = await prisma.contract.findMany({
    where: {
      ...scopeToStore(ctx),
      ...(status && (CONTRACT_STATUS as readonly string[]).includes(status) ? { status } : {}),
      ...(q
        ? {
            OR: [
              { contractNo: { contains: q.toUpperCase() } },
              { customer: { name: { contains: q } } },
              { quote: { quoteNo: { contains: q.toUpperCase() } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: RESULT_LIMIT,
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { name: true } },
      quote: { select: { id: true, quoteNo: true } },
      signatureRequests: { orderBy: { requestedAt: "desc" } },
    },
  });

  const withState = rows.map((contract) => {
    const request = currentSignatureRequest(contract);
    return { contract, request, state: request ? signatureState(request, now) : null };
  });

  // P1 전자서명 미완료 알림 — 저장하지 않고 조회 시점에 파생한다 (계획 §1).
  const stale = withState.filter((row) => row.state?.isStale);

  return (
    <>
      <PageHeader title="계약 및 전자서명" />
      <main className="flex-1 overflow-y-auto p-xl">
        <div className="mx-auto max-w-container">
          <ContractNoticeBanner
            notice={pickOne(params, "contract")}
            detail={pickOne(params, "detail")}
          />

          {stale.length > 0 && (
            <Notice tone="warning" className="mb-lg">
              전자서명이 {SIGNATURE_STALE_DAYS}일 이상 완료되지 않은 계약이 {stale.length}건
              있습니다:{" "}
              {stale.map((row, index) => (
                <span key={row.contract.id}>
                  {index > 0 && ", "}
                  <Link href={`/contracts/${row.contract.id}`} className="underline">
                    {row.contract.contractNo} ({row.contract.customer.name})
                  </Link>
                </span>
              ))}
            </Notice>
          )}

          <CardGrid>
            <Card title="계약 검색" className="col-span-12">
              <form method="get" action="/contracts" className="flex flex-wrap items-end gap-lg">
                <div className="min-w-[280px] flex-1">
                  <TextField
                    name="q"
                    label="계약번호 · 고객명 · 견적번호"
                    defaultValue={q}
                    placeholder="계약번호 또는 고객명"
                  />
                </div>
                <div className="w-48">
                  <Select name="status" label="계약 상태" defaultValue={status ?? ""}>
                    <option value="">전체</option>
                    <option value="PENDING_SIGNATURE">서명 대기</option>
                    <option value="SIGNED">서명 완료</option>
                    <option value="CHANGED">변경됨</option>
                    <option value="CANCELLED">취소</option>
                  </Select>
                </div>
                <div className="pb-px">
                  <Button type="submit">검색</Button>
                </div>
              </form>
            </Card>

            <Card title={`계약 ${rows.length}건`} flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>계약번호</TH>
                    <TH>고객</TH>
                    <TH>견적</TH>
                    <TH className="text-right">계약금액</TH>
                    <TH>계약 상태</TH>
                    <TH>서명 상태</TH>
                    <TH>담당</TH>
                    <TH>생성일</TH>
                  </TR>
                </THead>
                <TBody>
                  {withState.length === 0 ? (
                    <TableEmpty colSpan={8}>
                      계약이 없습니다. 결제 승인이 끝난 견적에서 계약을 생성하세요.
                    </TableEmpty>
                  ) : (
                    withState.map(({ contract, state }) => (
                      <TR key={contract.id}>
                        <TD>
                          <Link
                            href={`/contracts/${contract.id}`}
                            className="font-semibold text-lg-red hover:underline"
                          >
                            {contract.contractNo}
                          </Link>
                        </TD>
                        <TD>
                          <Link
                            href={`/customers/${contract.customer.id}`}
                            className="hover:text-lg-red hover:underline"
                          >
                            {contract.customer.name}
                          </Link>
                        </TD>
                        <TD>
                          <Link
                            href={`/quotes/${contract.quote.id}`}
                            className="text-gray-700 hover:text-lg-red hover:underline"
                          >
                            {contract.quote.quoteNo}
                          </Link>
                        </TD>
                        <TD className="text-right font-semibold tabular-nums">
                          {formatKRW(contract.totalAmount)}
                        </TD>
                        <TD>
                          <ContractStatusBadge status={contract.status} />
                        </TD>
                        <TD>{state ? <SignaturePhaseBadge state={state} /> : "-"}</TD>
                        <TD className="text-gray-700">{contract.manager.name}</TD>
                        <TD className="text-gray-700">{formatDate(contract.createdAt)}</TD>
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
