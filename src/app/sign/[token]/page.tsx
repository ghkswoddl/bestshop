import { notFound } from "next/navigation";
import { Card, Notice, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import type { RawSearchParams } from "@/lib/catalog";
import { pickOne } from "@/lib/catalog";
import {
  findSignatureByToken,
  parseSnapshot,
  signatureState,
  type CustomerSnapshot,
  type DeliveryAddressSnapshot,
  type FinanceSnapshot,
} from "@/lib/contracts";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { aprLabel } from "@/lib/payments";
import { formatPhone } from "@/lib/phone";
import { SignaturePad } from "./SignaturePad";

/**
 * 고객 전자서명 화면 — **의도적으로 인증이 없다.**
 *
 * 고객은 이 앱의 계정이 없다 (계획 §1: 토큰 기반 공개 링크 + Canvas 서명, 모의 구현).
 * 접근 제어는 32바이트 난수 토큰의 소지이고, `(app)` 라우트 그룹 **바깥**에 두어
 * 세션 가드와 앱 셸을 모두 피한다. 매장 스코프가 없는 것은 누락이 아니라 이 화면의 설계다.
 */
export default async function SignPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { token } = await params;
  const search = await searchParams;

  const request = await findSignatureByToken(token);
  if (!request) notFound();

  const { contract } = request;
  const state = signatureState(request);
  const customer = parseSnapshot<CustomerSnapshot>(contract.customerSnapshotJson);
  const address = parseSnapshot<DeliveryAddressSnapshot>(contract.deliveryAddressSnapshotJson);
  const finance = parseSnapshot<FinanceSnapshot>(contract.financeSnapshotJson);

  return (
    <main className="min-h-screen bg-gray-100 px-lg py-xl">
      <div className="mx-auto max-w-[720px]">
        <header className="mb-lg text-center">
          <p className="text-h2 text-lg-red">LG Bestshop</p>
          <h1 className="mt-xs text-display text-gray-900">전자 계약서 서명</h1>
          <p className="mt-xs text-caption text-gray-700">
            {contract.store.name} · {formatPhone(contract.store.phone)}
          </p>
        </header>

        {pickOne(search, "signed") === "1" || state.phase === "SIGNED" ? (
          <Notice tone="success" className="mb-lg">
            이미 서명이 완료된 계약입니다 ({formatDateTime(request.signedAt)}). 추가로 서명하실
            필요가 없습니다.
          </Notice>
        ) : state.phase === "EXPIRED" ? (
          <Notice tone="error" className="mb-lg">
            서명 링크가 만료되었습니다 (만료일 {formatDate(request.expiresAt)}). 담당 매니저에게
            재발송을 요청해 주세요.
          </Notice>
        ) : state.phase === "INVALIDATED" ? (
          <Notice tone="error" className="mb-lg">
            이 서명 링크는 더 이상 사용할 수 없습니다
            {request.invalidatedReason ? ` (${request.invalidatedReason})` : ""}. 담당 매니저에게
            문의해 주세요.
          </Notice>
        ) : (
          pickOne(search, "error") === "1" && (
            <Notice tone="error" className="mb-lg">
              성함과 서명을 모두 입력해 주세요.
            </Notice>
          )
        )}

        <div className="flex flex-col gap-lg">
          <Card title="계약 내용">
            <dl className="grid grid-cols-1 gap-x-xl sm:grid-cols-2">
              <div className="flex gap-md py-sm">
                <dt className="w-24 shrink-0 text-caption text-gray-700">계약번호</dt>
                <dd className="text-body tabular-nums text-gray-900">{contract.contractNo}</dd>
              </div>
              <div className="flex gap-md py-sm">
                <dt className="w-24 shrink-0 text-caption text-gray-700">계약일</dt>
                <dd className="text-body text-gray-900">{formatDate(contract.createdAt)}</dd>
              </div>
              <div className="flex gap-md py-sm">
                <dt className="w-24 shrink-0 text-caption text-gray-700">계약자</dt>
                <dd className="text-body text-gray-900">{customer?.name ?? "-"}</dd>
              </div>
              <div className="flex gap-md py-sm">
                <dt className="w-24 shrink-0 text-caption text-gray-700">연락처</dt>
                <dd className="text-body tabular-nums text-gray-900">
                  {customer?.phone ? formatPhone(customer.phone) : "-"}
                </dd>
              </div>
              <div className="flex gap-md py-sm sm:col-span-2">
                <dt className="w-24 shrink-0 text-caption text-gray-700">배송지</dt>
                <dd className="text-body text-gray-900">
                  {[address?.address, address?.addressDetail].filter(Boolean).join(" ") || "-"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="계약 상품" flush>
            <Table>
              <THead>
                <TR>
                  <TH>상품</TH>
                  <TH className="text-right">수량</TH>
                  <TH className="text-right">금액</TH>
                </TR>
              </THead>
              <TBody>
                {contract.quote.items.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <p className="font-medium text-gray-900">{item.product.name}</p>
                      <p className="text-caption tabular-nums text-gray-700">
                        {item.product.modelCode}
                        {item.optionsJson ? ` · ${item.optionsJson}` : ""}
                      </p>
                    </TD>
                    <TD className="text-right tabular-nums">{item.qty}</TD>
                    <TD className="text-right font-semibold tabular-nums">
                      {formatKRW(item.lineTotal)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card title="결제 조건">
            <dl className="divide-y divide-gray-200">
              {finance && (
                <>
                  <div className="flex flex-wrap justify-between gap-x-md py-sm text-body">
                    <dt className="text-gray-700">결제수단</dt>
                    <dd className="text-gray-900 sm:text-right">
                      {finance.name}
                      {finance.months > 0
                        ? ` · ${finance.months}개월 · ${aprLabel(finance.apr)}`
                        : " · 일시납"}
                    </dd>
                  </div>
                  {finance.months > 0 && (
                    <div className="flex flex-wrap justify-between gap-x-md py-sm text-body">
                      <dt className="text-gray-700">월 납입금</dt>
                      <dd className="tabular-nums text-gray-900 sm:text-right">
                        {formatKRW(finance.monthlyAmount)} × {finance.months - 1}회 + 마지막{" "}
                        {formatKRW(finance.lastMonthAmount)}
                      </dd>
                    </div>
                  )}
                </>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-x-md py-md">
                <dt className="text-h3 text-gray-900">총 결제금액</dt>
                <dd className="text-display tabular-nums text-lg-red">
                  {formatKRW(contract.totalAmount)}
                </dd>
              </div>
            </dl>
          </Card>

          {state.isSignable ? (
            <Card title="전자서명">
              <p className="mb-lg text-body text-gray-700">
                위 계약 내용을 확인하였으며, 이에 동의합니다. 아래에 서명해 주세요.
              </p>
              <SignaturePad token={token} />
            </Card>
          ) : (
            state.phase === "SIGNED" &&
            request.signatureImage && (
              <Card title="제출된 서명">
                <p className="mb-sm text-caption text-gray-700">
                  서명자: {request.signerName ?? "-"}
                </p>
                {/* 고객이 Canvas 로 그린 data URL. next/image 최적화 대상이 아니다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={request.signatureImage}
                  alt="제출된 서명"
                  className="h-32 max-w-full rounded-control border border-gray-200 bg-white"
                />
              </Card>
            )
          )}

          <p className="pb-xl text-center text-caption text-gray-700">
            본 서명 페이지는 시연용 모의 전자서명입니다. 문의: {contract.store.name}{" "}
            {formatPhone(contract.store.phone)}
          </p>
        </div>
      </div>
    </main>
  );
}
