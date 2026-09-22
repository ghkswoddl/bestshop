import { notFound } from "next/navigation";
import { LinkButton, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { findQuote, quoteValidity } from "@/lib/quotes";

/**
 * 견적서 출력용 화면 (PRD §4 P1 "견적서 PDF 출력 및 고객 공유").
 *
 * PDF 라이브러리를 쓰지 않고 브라우저 인쇄(Ctrl+P → PDF로 저장)에 맡긴다. 서버에서
 * 렌더한 같은 데이터를 쓰므로 금액이 어긋날 여지가 없고, 폰트/한글 임베딩 문제도 없다.
 * 앱 셸(사이드바/헤더)은 globals.css 의 `@media print` 가 걷어낸다.
 */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;

  const quote = await findQuote(ctx, id);
  if (!quote) notFound();

  const validity = quoteValidity(quote);
  const address = [quote.customer.address, quote.customer.addressDetail].filter(Boolean).join(" ");

  return (
    <main className="flex-1 overflow-y-auto bg-white p-xl">
      <div className="print-sheet mx-auto max-w-[800px]">
        <div className="print-hidden mb-xl flex flex-col items-start gap-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-gray-700">
            브라우저 인쇄(Ctrl+P / Cmd+P)에서 &lsquo;PDF로 저장&rsquo;을 선택하면 견적서 파일이
            만들어집니다.
          </p>
          <LinkButton href={`/quotes/${quote.id}`} variant="secondary">
            견적 편집으로 돌아가기
          </LinkButton>
        </div>

        <header className="flex flex-col gap-lg border-b-2 border-lg-red pb-lg sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
          <div>
            <h1 className="text-display text-gray-900">견 적 서</h1>
            <p className="mt-sm text-body tabular-nums text-gray-700">
              견적번호 {quote.quoteNo}
              {quote.version > 1 ? ` (버전 ${quote.version})` : ""}
            </p>
          </div>
          <div className="sm:text-right print:text-right">
            <p className="text-h2 text-lg-red">LG Bestshop</p>
            <p className="text-body text-gray-900">{quote.store.name}</p>
            <p className="text-caption text-gray-700">{quote.store.address}</p>
            <p className="text-caption tabular-nums text-gray-700">{quote.store.phone}</p>
          </div>
        </header>

        <section className="mt-xl grid grid-cols-1 gap-xl sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="mb-sm text-h3 text-gray-900">고객 정보</h2>
            <dl className="text-body text-gray-900">
              <div className="flex gap-md py-xs">
                <dt className="w-20 shrink-0 text-gray-700">고객명</dt>
                <dd>{quote.customer.name}</dd>
              </div>
              <div className="flex gap-md py-xs">
                <dt className="w-20 shrink-0 text-gray-700">연락처</dt>
                <dd className="tabular-nums">{formatPhone(quote.customer.phone)}</dd>
              </div>
              {quote.customer.memberNo && (
                <div className="flex gap-md py-xs">
                  <dt className="w-20 shrink-0 text-gray-700">회원번호</dt>
                  <dd className="tabular-nums">{quote.customer.memberNo}</dd>
                </div>
              )}
              {address && (
                <div className="flex gap-md py-xs">
                  <dt className="w-20 shrink-0 text-gray-700">주소</dt>
                  <dd>{address}</dd>
                </div>
              )}
            </dl>
          </div>
          <div>
            <h2 className="mb-sm text-h3 text-gray-900">견적 정보</h2>
            <dl className="text-body text-gray-900">
              <div className="flex gap-md py-xs">
                <dt className="w-20 shrink-0 text-gray-700">작성일</dt>
                <dd>{formatDateTime(quote.createdAt)}</dd>
              </div>
              <div className="flex gap-md py-xs">
                <dt className="w-20 shrink-0 text-gray-700">유효기간</dt>
                <dd>
                  {quote.validUntil ? `${formatDate(quote.validUntil)}까지` : "별도 협의"}
                  {validity.level === "EXPIRED" && " (경과)"}
                </dd>
              </div>
              <div className="flex gap-md py-xs">
                <dt className="w-20 shrink-0 text-gray-700">담당</dt>
                <dd>
                  {quote.manager.name} ({quote.manager.employeeNo})
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-xl">
          <h2 className="mb-sm text-h3 text-gray-900">견적 품목</h2>
          <Table className="border border-gray-200">
            <THead>
              <TR>
                <TH>상품</TH>
                <TH className="text-right">단가</TH>
                <TH className="text-right">수량</TH>
                <TH className="text-right">할인</TH>
                <TH className="text-right">금액</TH>
              </TR>
            </THead>
            <TBody>
              {quote.items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-caption tabular-nums text-gray-700">
                      {item.product.modelCode}
                      {item.optionsJson ? ` · ${item.optionsJson}` : ""}
                    </p>
                  </TD>
                  <TD className="text-right tabular-nums">{formatKRW(item.unitPriceSnapshot)}</TD>
                  <TD className="text-right tabular-nums">{item.qty}</TD>
                  <TD className="text-right tabular-nums">
                    {item.discountAmount > 0 ? `- ${formatKRW(item.discountAmount)}` : "-"}
                  </TD>
                  <TD className="text-right font-semibold tabular-nums">
                    {formatKRW(item.lineTotal)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>

        <section className="mt-xl flex justify-end">
          <dl className="w-full sm:w-80 print:w-80">
            <div className="flex justify-between border-b border-gray-200 py-sm text-body">
              <dt className="text-gray-700">상품 합계</dt>
              <dd className="tabular-nums">{formatKRW(quote.subtotal)}</dd>
            </div>
            <div className="flex justify-between border-b border-gray-200 py-sm text-body">
              <dt className="text-gray-700">할인 합계</dt>
              <dd className="tabular-nums">
                {quote.discountTotal > 0 ? `- ${formatKRW(quote.discountTotal)}` : formatKRW(0)}
              </dd>
            </div>
            <div className="flex justify-between border-b border-gray-200 py-sm text-body">
              <dt className="text-gray-700">배송비</dt>
              <dd className="tabular-nums">{formatKRW(quote.deliveryFee)}</dd>
            </div>
            <div className="flex justify-between border-b border-gray-200 py-sm text-body">
              <dt className="text-gray-700">설치비</dt>
              <dd className="tabular-nums">{formatKRW(quote.installFee)}</dd>
            </div>
            <div className="flex items-baseline justify-between py-md">
              <dt className="text-h3 text-gray-900">합계 금액</dt>
              <dd className="text-display tabular-nums text-lg-red">
                {formatKRW(quote.grandTotal)}
              </dd>
            </div>
          </dl>
        </section>

        {quote.memo && (
          <section className="mt-xl border-t border-gray-200 pt-lg">
            <h2 className="mb-sm text-h3 text-gray-900">비고</h2>
            <p className="whitespace-pre-wrap text-body text-gray-700">{quote.memo}</p>
          </section>
        )}

        <footer className="mt-2xl border-t border-gray-200 pt-lg text-caption text-gray-700">
          <p>· 본 견적서의 금액은 작성 시점 단가와 프로모션을 기준으로 산정되었습니다.</p>
          <p>· 견적 저장만으로는 재고가 확보되지 않으며, 재고는 계약 시점에 확정됩니다.</p>
          <p>· 유효기간이 지난 견적은 재견적이 필요할 수 있습니다.</p>
        </footer>
      </div>
    </main>
  );
}
