import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardGrid,
  LinkButton,
  Notice,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
  TextArea,
  TextField,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { pickOne, type RawSearchParams } from "@/lib/catalog";
import {
  buildTimeline,
  findConsultation,
  followUpState,
  isConsultationTerminal,
} from "@/lib/consultations";
import {
  addConsultationNoteAction,
  addFollowUpAction,
  cancelFollowUpAction,
  closeConsultationAction,
  completeFollowUpAction,
  deleteConsultationNoteAction,
  saveConsultationSummaryAction,
} from "@/lib/consultation-actions";
import {
  CONSULTATION_CHANNEL_LABEL,
  FOLLOW_UP_TYPE,
  FOLLOW_UP_TYPE_LABEL,
  type ConsultationChannel,
} from "@/lib/enums";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ConfirmSubmitButton } from "../../customers/_components/ConfirmSubmitButton";
import {
  ConsultationNoticeBanner,
  FollowUpBadge,
  FollowUpTypeBadge,
  StageBadge,
  TimelineBadge,
} from "../_components/badges";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-md py-sm">
      <dt className="w-24 shrink-0 text-caption text-gray-700">{label}</dt>
      <dd className="min-w-0 break-words text-body text-gray-900">{value || "-"}</dd>
    </div>
  );
}

export default async function ConsultationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const ctx = await requireManager();
  const { id } = await params;
  const search = await searchParams;

  const consultation = await findConsultation(ctx, id);
  if (!consultation) notFound();

  const timeline = buildTimeline(consultation);
  const closed = isConsultationTerminal(consultation.stage);
  const openFollowUps = consultation.followUps.filter((row) => row.status === "PENDING");

  return (
    <>
      <PageHeader
        title={`상담 · ${consultation.customer.name}`}
        actions={
          <>
            <LinkButton href={`/customers/${consultation.customer.id}`} variant="secondary">
              고객상세
            </LinkButton>
            <LinkButton href="/consultations" variant="secondary">
              상담 목록
            </LinkButton>
          </>
        }
      />
      <main className="flex-1 overflow-y-auto p-md sm:p-xl">
        <div className="mx-auto max-w-container">
          <ConsultationNoticeBanner notice={pickOne(search, "consultation")} />

          {closed && (
            <Notice tone="neutral" className="mb-lg">
              종료된 상담입니다 ({formatDateTime(consultation.endedAt)}). 단계는 되돌릴 수
              없으며, 새 상담이 필요하면 고객상세에서 다시 시작하세요.
            </Notice>
          )}

          <CardGrid>
            <Card
              title="상담 정보"
              className="col-span-12 lg:col-span-5"
              action={<StageBadge stage={consultation.stage} />}
            >
              <dl className="divide-y divide-gray-200">
                <Field
                  label="고객"
                  value={
                    <Link
                      href={`/customers/${consultation.customer.id}`}
                      className="text-lg-red hover:underline"
                    >
                      {consultation.customer.name}
                    </Link>
                  }
                />
                <Field
                  label="연락처"
                  value={
                    <span className="tabular-nums">{formatPhone(consultation.customer.phone)}</span>
                  }
                />
                <Field label="상담일시" value={formatDateTime(consultation.startedAt)} />
                <Field
                  label="채널"
                  value={
                    consultation.channel
                      ? (CONSULTATION_CHANNEL_LABEL[consultation.channel as ConsultationChannel] ??
                        consultation.channel)
                      : null
                  }
                />
                <Field label="담당 매니저" value={consultation.manager.name} />
                <Field label="인수 담당" value={consultation.assignedManager?.name} />
                <Field label="매장" value={consultation.store.name} />
                <Field label="종료일시" value={formatDateTime(consultation.endedAt)} />
              </dl>
            </Card>

            <Card title="상담 요약 및 종료" className="col-span-12 lg:col-span-7">
              {closed ? (
                <>
                  <p className="text-caption text-gray-700">상담 요약</p>
                  <p className="mt-sm whitespace-pre-wrap text-body text-gray-900">
                    {consultation.summary ?? "요약이 기록되지 않았습니다."}
                  </p>
                </>
              ) : (
                <>
                  <form action={saveConsultationSummaryAction} className="flex flex-col gap-md">
                    <input type="hidden" name="consultationId" value={consultation.id} />
                    <TextArea
                      name="summary"
                      label="상담 요약"
                      defaultValue={consultation.summary ?? ""}
                      placeholder="상담 결과와 고객 반응을 한두 줄로 정리합니다."
                    />
                    <div className="flex justify-end">
                      <Button type="submit" variant="secondary">
                        요약 저장
                      </Button>
                    </div>
                  </form>

                  <div className="mt-lg border-t border-gray-200 pt-lg">
                    <p className="mb-md text-body text-gray-700">
                      판매로 이어지지 않은 상담을 마무리합니다. 종료하면 단계가{" "}
                      <strong>상담종료</strong>가 되고 되돌릴 수 없습니다. 주문까지 진행된 상담은
                      배송 완료 시 <strong>완료</strong>로 자동 전환되므로 종료할 필요가 없습니다.
                    </p>
                    <form
                      action={closeConsultationAction}
                      className="flex flex-wrap items-end justify-end gap-md"
                    >
                      <input type="hidden" name="consultationId" value={consultation.id} />
                      <div className="w-full sm:w-auto sm:min-w-[240px] sm:grow">
                        <TextField
                          name="summary"
                          label="종료 사유 / 요약"
                          placeholder="예산 미달로 보류"
                        />
                      </div>
                      <ConfirmSubmitButton confirmMessage="상담을 종료할까요? 단계는 되돌릴 수 없습니다.">
                        상담 종료
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </>
              )}
            </Card>

            <Card
              title={`상담 메모 ${consultation.notes.length}건`}
              className="col-span-12 lg:col-span-7"
            >
              {!closed && (
                <form action={addConsultationNoteAction} className="mb-lg flex flex-col gap-md">
                  <input type="hidden" name="consultationId" value={consultation.id} />
                  <TextArea
                    name="content"
                    label="새 메모"
                    required
                    rows={2}
                    placeholder="고객 요구사항, 결정 사항, 다음 약속 등"
                  />
                  <div className="flex justify-end">
                    <Button type="submit">메모 등록</Button>
                  </div>
                </form>
              )}

              {consultation.notes.length === 0 ? (
                <p className="text-body text-gray-400">등록된 메모가 없습니다.</p>
              ) : (
                <ul className="flex flex-col gap-md">
                  {consultation.notes.map((note) => {
                    const mine = note.managerId === ctx.manager.id;
                    return (
                      <li key={note.id} className="rounded-control border border-gray-200 p-md">
                        <div className="flex flex-wrap items-center justify-between gap-sm">
                          <div className="flex flex-wrap items-center gap-sm">
                            <span className="text-caption font-medium text-gray-900">
                              {note.manager.name}
                            </span>
                            <span className="text-caption tabular-nums text-gray-700">
                              {formatDateTime(note.createdAt)}
                            </span>
                            {note.updatedAt.getTime() !== note.createdAt.getTime() && (
                              <Badge tone="neutral" showIcon={false}>
                                수정됨
                              </Badge>
                            )}
                          </div>
                          {mine && !closed && (
                            <form action={deleteConsultationNoteAction}>
                              <input type="hidden" name="consultationId" value={consultation.id} />
                              <input type="hidden" name="noteId" value={note.id} />
                              <ConfirmSubmitButton confirmMessage="이 메모를 삭제할까요?">
                                삭제
                              </ConfirmSubmitButton>
                            </form>
                          )}
                        </div>
                        <p className="mt-sm whitespace-pre-wrap text-body text-gray-900">
                          {note.content}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card
              title="후속조치"
              className="col-span-12 lg:col-span-5"
              action={
                openFollowUps.length > 0 ? (
                  <Badge tone="warning">예정 {openFollowUps.length}건</Badge>
                ) : undefined
              }
            >
              {!closed && (
                <form action={addFollowUpAction} className="mb-lg flex flex-col gap-md">
                  <input type="hidden" name="consultationId" value={consultation.id} />
                  <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                    <Select name="type" label="유형" defaultValue="CALL">
                      {FOLLOW_UP_TYPE.map((type) => (
                        <option key={type} value={type}>
                          {FOLLOW_UP_TYPE_LABEL[type]}
                        </option>
                      ))}
                    </Select>
                    <TextField name="dueAt" label="기한" type="date" required />
                  </div>
                  <TextField name="content" label="내용" placeholder="견적 재안내 전화" />
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary">
                      후속조치 등록
                    </Button>
                  </div>
                </form>
              )}

              {consultation.followUps.length === 0 ? (
                <p className="text-body text-gray-400">등록된 후속조치가 없습니다.</p>
              ) : (
                <ul className="flex flex-col gap-md">
                  {consultation.followUps.map((followUp) => {
                    const state = followUpState(followUp);
                    return (
                      <li key={followUp.id} className="rounded-control border border-gray-200 p-md">
                        <div className="flex flex-wrap items-center gap-sm">
                          <FollowUpTypeBadge type={followUp.type} />
                          <FollowUpBadge state={state} />
                          <span className="text-caption tabular-nums text-gray-700">
                            {formatDate(followUp.dueAt)}
                          </span>
                        </div>
                        <p className="mt-sm text-body text-gray-900">{followUp.content ?? "-"}</p>
                        <p className="mt-xs text-caption text-gray-700">
                          담당 {followUp.manager.name}
                        </p>
                        {followUp.status === "PENDING" && (
                          <div className="mt-sm flex flex-wrap gap-xs">
                            <form action={completeFollowUpAction}>
                              <input type="hidden" name="consultationId" value={consultation.id} />
                              <input type="hidden" name="followUpId" value={followUp.id} />
                              <Button type="submit" variant="ghost">
                                완료 처리
                              </Button>
                            </form>
                            <form action={cancelFollowUpAction}>
                              <input type="hidden" name="consultationId" value={consultation.id} />
                              <input type="hidden" name="followUpId" value={followUp.id} />
                              <Button type="submit" variant="ghost">
                                취소
                              </Button>
                            </form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="견적 · 계약 · 배송 연결" flush className="col-span-12">
              <Table>
                <THead>
                  <TR>
                    <TH>견적</TH>
                    <TH className="text-right">견적금액</TH>
                    <TH>결제설계</TH>
                    <TH>계약</TH>
                    <TH>서명</TH>
                    <TH>주문 / 배송</TH>
                  </TR>
                </THead>
                <TBody>
                  {consultation.quotes.length === 0 ? (
                    <TableEmpty colSpan={6}>
                      이 상담에 연결된 견적이 없습니다. 견적서 작성에서 상담을 연결하세요.
                    </TableEmpty>
                  ) : (
                    consultation.quotes.map((quote) => (
                      <TR key={quote.id}>
                        <TD>
                          <Link
                            href={`/quotes/${quote.id}`}
                            className="font-semibold text-lg-red hover:underline"
                          >
                            {quote.quoteNo}
                          </Link>
                          {quote.version > 1 && (
                            <span className="ml-sm text-caption text-gray-700">
                              v{quote.version}
                            </span>
                          )}
                        </TD>
                        <TD className="text-right tabular-nums">{formatKRW(quote.grandTotal)}</TD>
                        <TD className="text-gray-700">
                          {quote.paymentPlan
                            ? `${quote.paymentPlan.financeProduct.name} · ${formatKRW(quote.paymentPlan.totalPayable)}`
                            : "-"}
                        </TD>
                        <TD>
                          {quote.contract ? (
                            <Link
                              href={`/contracts/${quote.contract.id}`}
                              className="text-lg-red hover:underline"
                            >
                              {quote.contract.contractNo}
                            </Link>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TD>
                        <TD className="text-gray-700">
                          {quote.contract?.signedAt
                            ? formatDate(quote.contract.signedAt)
                            : quote.contract
                              ? "대기"
                              : "-"}
                        </TD>
                        <TD>
                          {quote.contract?.order ? (
                            <Link
                              href={`/deliveries/${quote.contract.order.id}`}
                              className="text-lg-red hover:underline"
                            >
                              {quote.contract.order.orderNo}
                            </Link>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>

            <Card title="상담 타임라인" className="col-span-12">
              <ul className="flex flex-col gap-md">
                {timeline.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-start gap-sm border-b border-gray-200 pb-md last:border-b-0 sm:gap-md"
                  >
                    <span className="shrink-0 text-caption tabular-nums text-gray-700 sm:w-40">
                      {formatDateTime(entry.at)}
                    </span>
                    <TimelineBadge kind={entry.kind} />
                    <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                      <p className="text-body font-medium text-gray-900">
                        {entry.href ? (
                          <Link href={entry.href} className="text-lg-red hover:underline">
                            {entry.title}
                          </Link>
                        ) : (
                          entry.title
                        )}
                      </p>
                      {entry.detail && (
                        <p className="mt-xs whitespace-pre-wrap text-caption text-gray-700">
                          {entry.detail}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </CardGrid>
        </div>
      </main>
    </>
  );
}
