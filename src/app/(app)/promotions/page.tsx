import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Notice,
  Select,
  Table,
  TableEmpty,
  TBody,
  TD,
  TextField,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  promotionBenefitLabel,
  promotionFlags,
  PROMOTION_PHASE_LABEL,
  type PromotionPhase,
} from "@/lib/promotions";
import { AlertBadges, PhaseBadge } from "./_components/badges";

const PHASE_FILTERS: PromotionPhase[] = ["ACTIVE", "UPCOMING", "EXPIRED", "DRAFT", "CANCELLED"];

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  await requireManager();

  const q = pickOne(params, "q");
  const phaseParam = pickOne(params, "phase");
  const phaseFilter = PHASE_FILTERS.includes(phaseParam as PromotionPhase)
    ? (phaseParam as PromotionPhase)
    : undefined;
  // 상품 상세 / 견적 화면에서 "이 상품에 적용 가능한 프로모션" 으로 딥링크할 때 쓴다.
  const productId = pickOne(params, "productId");

  const [rows, product] = await Promise.all([
    prisma.promotion.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { code: { contains: q } },
                { code: { contains: q.toUpperCase() } },
                { description: { contains: q } },
              ],
            }
          : {}),
        ...(productId ? { products: { some: { productId } } } : {}),
      },
      include: { _count: { select: { products: true } } },
      orderBy: [{ endsAt: "asc" }],
    }),
    productId
      ? prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } })
      : Promise.resolve(null),
  ]);

  const at = new Date();
  // 진행 단계는 파생값이라 SQL where 로 표현할 수 없다 — 메모리에서 거른다 (worker-3 의 재고 상태와 동일).
  const all = rows.map((promotion) => ({ promotion, flags: promotionFlags(promotion, at) }));
  const list = phaseFilter ? all.filter((row) => row.flags.phase === phaseFilter) : all;

  const newCount = all.filter((row) => row.flags.isNew).length;
  const endingSoon = all.filter((row) => row.flags.isEndingSoon);
  const activeCount = all.filter((row) => row.flags.isActive).length;

  return (
    <>
      <PageHeader
        title="프로모션 공지"
        actions={
          productId ? (
            <Link href="/promotions">
              <Button variant="secondary">전체 프로모션</Button>
            </Link>
          ) : undefined
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto flex max-w-container flex-col gap-lg">
          {product && (
            <Notice tone="info">
              <strong className="font-semibold">{product.name}</strong> 에 연결된 프로모션만
              표시하고 있습니다.{" "}
              <Link href={`/products/${product.id}`} className="underline hover:text-lg-red">
                상품 상세로 이동
              </Link>
            </Notice>
          )}

          {endingSoon.length > 0 && (
            <Notice tone="warning">
              <strong className="font-semibold">종료 예정 {endingSoon.length}건</strong> — 7일 이내
              종료됩니다: {endingSoon.map((row) => row.promotion.title).join(" · ")}
            </Notice>
          )}

          {newCount > 0 && (
            <Notice tone="info">
              최근 7일 이내 등록된 <strong className="font-semibold">신규 프로모션 {newCount}건</strong>
              이 있습니다.
            </Notice>
          )}

          <Card title="검색 및 필터">
            <form method="get" className="grid grid-cols-1 items-end gap-md md:grid-cols-12">
              {productId && <input type="hidden" name="productId" value={productId} />}
              <div className="md:col-span-6">
                <TextField
                  name="q"
                  label="검색"
                  placeholder="프로모션명 · 코드 · 설명"
                  defaultValue={q ?? ""}
                />
              </div>
              <div className="md:col-span-3">
                <Select name="phase" label="진행 단계" defaultValue={phaseFilter ?? ""}>
                  <option value="">전체</option>
                  {PHASE_FILTERS.map((phase) => (
                    <option key={phase} value={phase}>
                      {PROMOTION_PHASE_LABEL[phase]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-sm md:col-span-3 md:justify-end md:pb-px">
                <Link href={productId ? `/promotions?productId=${productId}` : "/promotions"}>
                  <Button variant="secondary">초기화</Button>
                </Link>
                <Button type="submit">검색</Button>
              </div>
            </form>
          </Card>

          <Card
            title="프로모션 목록"
            flush
            action={
              <span className="text-caption text-gray-700">
                총 {list.length}건 · 진행중 {activeCount}건
              </span>
            }
          >
            <Table>
              <THead>
                <TR>
                  <TH>프로모션</TH>
                  <TH>기간</TH>
                  <TH>혜택</TH>
                  <TH className="text-right">대상상품</TH>
                  <TH>진행 단계</TH>
                  <TH>알림</TH>
                </TR>
              </THead>
              <TBody>
                {list.length === 0 ? (
                  <TableEmpty colSpan={6}>조건에 맞는 프로모션이 없습니다.</TableEmpty>
                ) : (
                  list.map(({ promotion, flags }) => (
                    <TR key={promotion.id}>
                      <TD>
                        <Link
                          href={`/promotions/${promotion.id}`}
                          className="font-medium text-gray-900 hover:text-lg-red"
                        >
                          {promotion.title}
                        </Link>
                        <div className="text-caption tabular-nums text-gray-700">
                          {promotion.code}
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums text-gray-700">
                        {formatDate(promotion.startsAt)} ~ {formatDate(promotion.endsAt)}
                      </TD>
                      <TD className="text-gray-900">{promotionBenefitLabel(promotion)}</TD>
                      <TD className="text-right tabular-nums text-gray-700">
                        {promotion._count.products}개
                      </TD>
                      <TD>
                        <PhaseBadge phase={flags.phase} />
                      </TD>
                      <TD>
                        <AlertBadges flags={flags} />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </Card>

          <Notice tone="neutral">
            신규 · 종료임박 표시는 저장된 알림이 아니라 조회 시점에 계산한 값입니다. 견적에 실제로
            적용 가능한지는 견적서 작성 화면에서 다시 검증됩니다.
          </Notice>
        </div>
      </main>
    </>
  );
}
