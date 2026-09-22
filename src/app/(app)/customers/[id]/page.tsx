import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
  TextArea,
} from "@/components/ui";
import { requireManager, scopeToStore } from "@/lib/auth";
import {
  customerAccessWhere,
  recordCustomerView,
  replacementInfo,
  type ReplacementLevel,
} from "@/lib/customers";
import {
  addConsultationNoteAction,
  deleteApplianceAction,
  saveCustomerNoteAction,
  startConsultationAction,
} from "@/lib/customer-actions";
import { CONSULTATION_CHANNEL, CONSULTATION_CHANNEL_LABEL } from "@/lib/enums";
import { formatDate, formatDateTime, formatKRW, toDateInputValue } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { ApplianceDialog } from "../_components/ApplianceDialog";
import { ConfirmSubmitButton } from "../_components/ConfirmSubmitButton";
import { ConsentBadges, ReplacementBadge, StageBadge } from "../_components/badges";
import { CustomerFormDialog } from "../_components/CustomerFormDialog";

/** 진행중으로 볼 상담 단계 — 종료/취소 이전은 모두 열린 상담으로 본다. */
const CLOSED_STAGES = ["COMPLETED", "CANCELLED"];

/** 교체주기 참고정보 정렬 우선순위 (P1). */
const REPLACEMENT_PRIORITY: Record<ReplacementLevel, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  OK: 2,
  UNKNOWN: 3,
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-24 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="min-w-0 break-words text-body text-gray-900">{value || "-"}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireManager();
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id }, customerAccessWhere(ctx)] },
    include: {
      consents: { select: { type: true, granted: true, revokedAt: true } },
      ownedAppliances: {
        include: {
          category: { select: { id: true, code: true, name: true, replacementCycleMonths: true } },
          product: { select: { id: true, name: true, modelCode: true } },
        },
        orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
      },
      mergedInto: { select: { id: true, name: true } },
      mergedFrom: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!customer) notFound();

  const [consultations, categories, comparisons, quotes] = await Promise.all([
    prisma.consultation.findMany({
      where: { customerId: customer.id, ...scopeToStore(ctx) },
      orderBy: { startedAt: "desc" },
      include: {
        manager: { select: { name: true } },
        store: { select: { name: true } },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { manager: { select: { name: true } } },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    // Comparison 에는 storeId 가 없다. 작성한 매니저의 소속 매장으로 스코프한다.
    prisma.comparison.findMany({
      where: { customerId: customer.id, manager: scopeToStore(ctx) },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { items: { include: { product: { select: { id: true, name: true, modelCode: true } } } } },
    }),
    prisma.quote.findMany({
      where: { customerId: customer.id, ...scopeToStore(ctx) },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { items: { include: { product: { select: { id: true, name: true, modelCode: true } } } } },
    }),
  ]);

  await recordCustomerView(ctx, customer.id);

  const openConsultations = consultations.filter((row) => !CLOSED_STAGES.includes(row.stage));

  const appliances = customer.ownedAppliances.map((appliance) => ({
    ...appliance,
    replacement: replacementInfo(
      appliance.purchasedAt,
      appliance.category.replacementCycleMonths,
    ),
  }));

  const recommendationTargets = [...appliances].sort(
    (a, b) => REPLACEMENT_PRIORITY[a.replacement.level] - REPLACEMENT_PRIORITY[b.replacement.level],
  );

  const interestProducts = new Map<string, { id: string; name: string; modelCode: string; source: string }>();
  for (const comparison of comparisons) {
    for (const item of comparison.items) {
      interestProducts.set(item.product.id, { ...item.product, source: "상품비교" });
    }
  }
  for (const quote of quotes) {
    for (const item of quote.items) {
      interestProducts.set(item.product.id, { ...item.product, source: "견적" });
    }
  }

  const noteHistory = consultations.flatMap((consultation) =>
    consultation.notes.map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt,
      managerName: note.manager.name,
      stage: consultation.stage,
    })),
  );

  return (
    <>
      <PageHeader
        title={`고객상세 · ${customer.name}`}
        actions={
          <CustomerFormDialog
            mode="edit"
            triggerLabel="정보 수정"
            triggerVariant="secondary"
            values={{
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              memberNo: customer.memberNo ?? "",
              birthDate: toDateInputValue(customer.birthDate),
              address: customer.address ?? "",
              addressDetail: customer.addressDetail ?? "",
              email: customer.email ?? "",
            }}
          />
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <Link href="/customers" className="text-caption text-gray-700 hover:text-lg-red">
            ← 고객조회로 돌아가기
          </Link>

          <CardGrid className="mt-md">
            <Card title="고객 기본정보" className="col-span-12 lg:col-span-5">
              <dl className="divide-y divide-gray-200">
                <Field label="고객명" value={customer.name} />
                <Field
                  label="휴대폰번호"
                  value={<span className="tabular-nums">{formatPhone(customer.phone)}</span>}
                />
                <Field
                  label="회원번호"
                  value={<span className="tabular-nums">{customer.memberNo}</span>}
                />
                <Field label="생년월일" value={formatDate(customer.birthDate)} />
                <Field
                  label="주소"
                  value={[customer.address, customer.addressDetail].filter(Boolean).join(" ")}
                />
                <Field label="이메일" value={customer.email} />
                <Field label="등록일" value={formatDate(customer.createdAt)} />
              </dl>
              <div className="mt-lg border-t border-gray-200 pt-lg">
                <p className="mb-sm text-caption font-medium text-gray-700">
                  동의 및 개인정보 처리 상태
                </p>
                <ConsentBadges consents={customer.consents} />
              </div>
              {(customer.mergedInto || customer.mergedFrom.length > 0) && (
                <div className="mt-lg border-t border-gray-200 pt-lg">
                  <p className="mb-sm text-caption font-medium text-gray-700">중복 고객 연결</p>
                  {customer.mergedInto && (
                    <p className="text-body text-gray-700">
                      이 레코드는{" "}
                      <Link
                        href={`/customers/${customer.mergedInto.id}`}
                        className="text-lg-red hover:underline"
                      >
                        {customer.mergedInto.name}
                      </Link>{" "}
                      으로 병합되었습니다.
                    </p>
                  )}
                  {customer.mergedFrom.map((merged) => (
                    <p key={merged.id} className="text-body text-gray-700">
                      <Link
                        href={`/customers/${merged.id}`}
                        className="text-lg-red hover:underline"
                      >
                        {merged.name}
                      </Link>{" "}
                      ({formatPhone(merged.phone)}) 레코드가 이 고객으로 병합되었습니다.
                    </p>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="상담"
              className="col-span-12 lg:col-span-7"
              action={<Badge tone="info">진행중 {openConsultations.length}건</Badge>}
            >
              <form
                action={startConsultationAction}
                className="flex flex-col gap-md rounded-card bg-gray-100 p-lg sm:flex-row sm:flex-wrap sm:items-end"
              >
                <input type="hidden" name="customerId" value={customer.id} />
                <div className="w-full sm:w-40">
                  <Select name="channel" label="상담 채널" defaultValue="VISIT">
                    {CONSULTATION_CHANNEL.map((channel) => (
                      <option key={channel} value={channel}>
                        {CONSULTATION_CHANNEL_LABEL[channel]}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit">상담 시작</Button>
                <p className="flex-1 text-caption text-gray-700 sm:min-w-[16rem]">
                  고객조회만으로는 상담이 생성되지 않습니다. 이 버튼을 눌러야 상담 건이 만들어집니다.
                </p>
              </form>

              <div className="mt-lg">
                <p className="mb-sm text-caption font-medium text-gray-700">상담 이력</p>
                <Table>
                  <THead>
                    <TR>
                      <TH>상담일시</TH>
                      <TH>단계</TH>
                      <TH>채널</TH>
                      <TH>담당</TH>
                      {ctx.isHQ && <TH>매장</TH>}
                    </TR>
                  </THead>
                  <TBody>
                    {consultations.length === 0 ? (
                      <TableEmpty colSpan={ctx.isHQ ? 5 : 4}>
                        아직 상담 이력이 없습니다.
                      </TableEmpty>
                    ) : (
                      consultations.map((consultation) => (
                        <TR key={consultation.id}>
                          <TD className="tabular-nums">{formatDateTime(consultation.startedAt)}</TD>
                          <TD>
                            <StageBadge stage={consultation.stage} />
                          </TD>
                          <TD className="text-gray-700">
                            {consultation.channel
                              ? (CONSULTATION_CHANNEL_LABEL[
                                  consultation.channel as keyof typeof CONSULTATION_CHANNEL_LABEL
                                ] ?? consultation.channel)
                              : "-"}
                          </TD>
                          <TD className="text-gray-700">{consultation.manager.name}</TD>
                          {ctx.isHQ && <TD className="text-gray-700">{consultation.store.name}</TD>}
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
                <p className="mt-sm text-caption text-gray-400">
                  상담 내용 기록과 단계 전환은 상담이력관리 화면에서 처리합니다.
                </p>
              </div>
            </Card>

            <Card
              title="보유가전"
              flush
              className="col-span-12"
              action={
                <ApplianceDialog
                  customerId={customer.id}
                  categories={categories}
                  triggerLabel="보유가전 추가"
                />
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>품목</TH>
                    <TH>모델</TH>
                    <TH>브랜드</TH>
                    <TH>구매일</TH>
                    <TH>구매가격</TH>
                    <TH>교체주기</TH>
                    <TH>관리</TH>
                  </TR>
                </THead>
                <TBody>
                  {appliances.length === 0 ? (
                    <TableEmpty colSpan={7}>등록된 보유가전이 없습니다.</TableEmpty>
                  ) : (
                    appliances.map((appliance) => (
                      <TR key={appliance.id}>
                        <TD>{appliance.category.name}</TD>
                        <TD>
                          <span className="font-medium">{appliance.modelName}</span>
                          {appliance.product && (
                            <span className="ml-sm text-caption text-gray-700">
                              ({appliance.product.modelCode})
                            </span>
                          )}
                        </TD>
                        <TD className="text-gray-700">{appliance.brand}</TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatDate(appliance.purchasedAt)}
                        </TD>
                        <TD className="tabular-nums text-gray-700">
                          {formatKRW(appliance.purchasePrice)}
                        </TD>
                        <TD>
                          <ReplacementBadge
                            level={appliance.replacement.level}
                            label={appliance.replacement.label}
                          />
                        </TD>
                        <TD>
                          <div className="flex items-center gap-xs">
                            <ApplianceDialog
                              customerId={customer.id}
                              categories={categories}
                              triggerLabel="수정"
                              triggerVariant="ghost"
                              values={{
                                id: appliance.id,
                                categoryId: appliance.categoryId,
                                modelName: appliance.modelName,
                                brand: appliance.brand,
                                purchasedAt: toDateInputValue(appliance.purchasedAt),
                                purchasePrice:
                                  appliance.purchasePrice == null
                                    ? ""
                                    : String(appliance.purchasePrice),
                                note: appliance.note ?? "",
                              }}
                            />
                            <form action={deleteApplianceAction}>
                              <input type="hidden" name="customerId" value={customer.id} />
                              <input type="hidden" name="applianceId" value={appliance.id} />
                              <ConfirmSubmitButton
                                confirmMessage={`보유가전 "${appliance.modelName}" 을(를) 삭제할까요?`}
                              >
                                삭제
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="추천상품 연계" className="col-span-12 lg:col-span-7">
              {recommendationTargets.length === 0 ? (
                <p className="text-body text-gray-400">
                  보유가전을 등록하면 품목별 추천상품 바로가기가 표시됩니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-md">
                  {recommendationTargets.map((appliance) => (
                    <li
                      key={appliance.id}
                      className="flex flex-wrap items-start justify-between gap-md rounded-control border border-gray-200 p-md"
                    >
                      <div className="min-w-0 flex-1 basis-full sm:basis-0">
                        <div className="flex flex-wrap items-center gap-sm">
                          <span className="text-h3 text-gray-900">{appliance.category.name}</span>
                          <span className="text-body text-gray-700">{appliance.modelName}</span>
                          <ReplacementBadge
                            level={appliance.replacement.level}
                            label={appliance.replacement.label}
                          />
                        </div>
                        <p className="mt-sm text-body text-gray-700">
                          {appliance.note ?? "등록된 상담 메모가 없습니다."}
                        </p>
                      </div>
                      <Link
                        href={`/products?categoryId=${appliance.category.id}&category=${appliance.category.code}`}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-control border border-gray-200 bg-white px-lg text-button text-gray-900 hover:bg-gray-100"
                      >
                        추천상품 보기
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="고객 관심상품" className="col-span-12 lg:col-span-5">
              {interestProducts.size === 0 ? (
                <p className="text-body text-gray-400">
                  상품비교·견적에 담긴 상품이 아직 없습니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-sm">
                  {[...interestProducts.values()].map((product) => (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-md rounded-control border border-gray-200 px-md py-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-body text-gray-900">{product.name}</p>
                        <p className="text-caption tabular-nums text-gray-700">
                          {product.modelCode}
                        </p>
                      </div>
                      <Badge tone="neutral" showIcon={false}>
                        {product.source}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="상담 메모 요약" className="col-span-12">
              <form action={saveCustomerNoteAction} className="flex flex-col gap-md">
                <input type="hidden" name="customerId" value={customer.id} />
                <TextArea
                  name="note"
                  label="고객 상시 메모"
                  defaultValue={customer.note ?? ""}
                  placeholder="선호 브랜드, 예산, 방문 주기 등 상담에 계속 참고할 내용"
                />
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary">
                    메모 저장
                  </Button>
                </div>
              </form>

              {openConsultations.length > 0 && (
                <form
                  action={addConsultationNoteAction}
                  className="mt-lg flex flex-col gap-md border-t border-gray-200 pt-lg"
                >
                  <div className="w-full sm:w-64">
                    <Select name="consultationId" label="메모를 남길 진행중 상담">
                      {openConsultations.map((consultation) => (
                        <option key={consultation.id} value={consultation.id}>
                          {formatDateTime(consultation.startedAt)} · {consultation.manager.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <TextArea name="content" label="상담 메모 추가" required rows={2} />
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary">
                      메모 등록
                    </Button>
                  </div>
                </form>
              )}

              <div className="mt-lg border-t border-gray-200 pt-lg">
                <p className="mb-sm text-caption font-medium text-gray-700">최근 상담 메모</p>
                {noteHistory.length === 0 ? (
                  <p className="text-body text-gray-400">등록된 상담 메모가 없습니다.</p>
                ) : (
                  <ul className="flex flex-col gap-md">
                    {noteHistory.map((note) => (
                      <li key={note.id} className="rounded-control border border-gray-200 p-md">
                        <div className="flex flex-wrap items-center gap-sm">
                          <StageBadge stage={note.stage} />
                          <span className="text-caption tabular-nums text-gray-700">
                            {formatDateTime(note.createdAt)}
                          </span>
                          <span className="text-caption text-gray-700">{note.managerName}</span>
                        </div>
                        <p className="mt-sm whitespace-pre-wrap text-body text-gray-900">
                          {note.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
