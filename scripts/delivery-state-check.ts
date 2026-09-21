// 배송·설치 상태머신 불변식 검증 (계획 §4 "불가능한 전이 차단").
//
//   npm run check:delivery-state
//
// 전이표를 전수로 훑어 "앞으로만 간다" 와 "배송 완료 전 설치 완료 불가" 를 강제한다.
// 서버 액션을 통한 실제 거부는 통합 검증(verify-phase9.mjs)이 따로 확인한다.

import {
  DELIVERY_TRANSITIONS,
  INSTALL_TRANSITIONS,
  canCompleteInstall,
  canTransitionDelivery,
  canTransitionInstall,
  isDeliveryDelayed,
  isInstallDelayed,
  orderProgress,
} from "@/lib/orders";
import { DELIVERY_STATUS, INSTALL_STATUS } from "@/lib/enums";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const HOUR = 3_600_000;
const NOW = new Date("2026-09-20T12:00:00+09:00");

// 정상 진행 순서. 이 순서를 거스르는 전이는 전이표에 없어야 한다.
const DELIVERY_ORDER = ["SCHEDULED", "PREPARING", "IN_TRANSIT", "DELIVERED"];
const INSTALL_ORDER = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];

console.log("\n== 배송 전이표 전수 ==");
{
  let backward = 0;
  let selfLoops = 0;
  for (const from of DELIVERY_STATUS) {
    for (const to of DELIVERY_STATUS) {
      const allowed = canTransitionDelivery(from, to);
      if (from === to && allowed) selfLoops++;

      const fromRank = DELIVERY_ORDER.indexOf(from);
      const toRank = DELIVERY_ORDER.indexOf(to);
      // 정상 경로 안에서 뒤로 가는 전이가 허용되면 위반이다.
      if (allowed && fromRank >= 0 && toRank >= 0 && toRank < fromRank) backward++;
    }
  }
  check("자기 자신으로의 전이 없음", selfLoops === 0, `${selfLoops}건`);
  check("정상 경로에서 후진 전이 없음", backward === 0, `${backward}건`);
  check("DELIVERED 는 종착", DELIVERY_TRANSITIONS.DELIVERED.length === 0);
  check("CANCELLED 는 종착", DELIVERY_TRANSITIONS.CANCELLED.length === 0);
  check("FAILED 는 종착 (재시도는 일정 변경 액션으로)", DELIVERY_TRANSITIONS.FAILED.length === 0);
  check("SCHEDULED → IN_TRANSIT 허용 (준비 단계 생략)", canTransitionDelivery("SCHEDULED", "IN_TRANSIT"));
  check("SCHEDULED → DELIVERED 금지", !canTransitionDelivery("SCHEDULED", "DELIVERED"));
  check("PREPARING → DELIVERED 금지", !canTransitionDelivery("PREPARING", "DELIVERED"));
  check("IN_TRANSIT → DELIVERED 허용", canTransitionDelivery("IN_TRANSIT", "DELIVERED"));
  check("DELIVERED → IN_TRANSIT 금지", !canTransitionDelivery("DELIVERED", "IN_TRANSIT"));
  check("알 수 없는 상태는 전이 불가", !canTransitionDelivery("NOPE", "DELIVERED"));
}

console.log("\n== 설치 전이표 전수 ==");
{
  let backward = 0;
  let selfLoops = 0;
  for (const from of INSTALL_STATUS) {
    for (const to of INSTALL_STATUS) {
      const allowed = canTransitionInstall(from, to);
      if (from === to && allowed) selfLoops++;
      const fromRank = INSTALL_ORDER.indexOf(from);
      const toRank = INSTALL_ORDER.indexOf(to);
      if (allowed && fromRank >= 0 && toRank >= 0 && toRank < fromRank) backward++;
    }
  }
  check("자기 자신으로의 전이 없음", selfLoops === 0, `${selfLoops}건`);
  check("정상 경로에서 후진 전이 없음", backward === 0, `${backward}건`);
  check("COMPLETED 는 종착", INSTALL_TRANSITIONS.COMPLETED.length === 0);
  check("SCHEDULED → COMPLETED 금지", !canTransitionInstall("SCHEDULED", "COMPLETED"));
  check("ASSIGNED → COMPLETED 금지", !canTransitionInstall("ASSIGNED", "COMPLETED"));
  check("IN_PROGRESS → COMPLETED 허용 (배송 조건은 별도)", canTransitionInstall("IN_PROGRESS", "COMPLETED"));
  check("COMPLETED → IN_PROGRESS 금지", !canTransitionInstall("COMPLETED", "IN_PROGRESS"));
}

console.log("\n== 설치 완료의 배송 선행조건 ==");
{
  const job = { orderItemId: "item-1", deliveryJobId: null };
  const deliveries = (status: string) => [{ id: "d1", orderItemId: "item-1", status }];

  for (const status of ["SCHEDULED", "PREPARING", "IN_TRANSIT", "FAILED"]) {
    check(
      `같은 품목 배송이 ${status} 면 설치 완료 거부`,
      canCompleteInstall(job, deliveries(status)) != null,
    );
  }
  check("같은 품목 배송이 DELIVERED 면 허용", canCompleteInstall(job, deliveries("DELIVERED")) === null);
  check(
    "같은 품목 배송이 CANCELLED 면 선행조건에서 제외되어 허용",
    canCompleteInstall(job, deliveries("CANCELLED")) === null,
  );
  check("대응 배송이 아예 없으면 허용 (설치만 접수)", canCompleteInstall(job, []) === null);
  check(
    "다른 품목의 배송은 선행조건이 아니다",
    canCompleteInstall(job, [{ id: "d9", orderItemId: "item-2", status: "SCHEDULED" }]) === null,
  );

  // deliveryJobId 로 직접 지정된 경우가 품목 매칭보다 우선한다.
  const linked = { orderItemId: "item-1", deliveryJobId: "d-target" };
  check(
    "지정된 배송작업이 미완료면 거부",
    canCompleteInstall(linked, [
      { id: "d-target", orderItemId: null, status: "IN_TRANSIT" },
      { id: "d-other", orderItemId: "item-1", status: "DELIVERED" },
    ]) != null,
  );
  check(
    "지정된 배송작업이 완료면 허용 (다른 배송이 미완료여도)",
    canCompleteInstall(linked, [
      { id: "d-target", orderItemId: null, status: "DELIVERED" },
      { id: "d-other", orderItemId: "item-1", status: "SCHEDULED" },
    ]) === null,
  );

  // 품목 지정이 없는 설치(주문 전체)는 모든 배송이 끝나야 한다.
  const wholeOrder = { orderItemId: null, deliveryJobId: null };
  check(
    "주문 전체 설치: 배송 하나라도 미완료면 거부",
    canCompleteInstall(wholeOrder, [
      { id: "d1", orderItemId: "item-1", status: "DELIVERED" },
      { id: "d2", orderItemId: "item-2", status: "IN_TRANSIT" },
    ]) != null,
  );
  check(
    "주문 전체 설치: 모든 배송 완료면 허용",
    canCompleteInstall(wholeOrder, [
      { id: "d1", orderItemId: "item-1", status: "DELIVERED" },
      { id: "d2", orderItemId: "item-2", status: "DELIVERED" },
    ]) === null,
  );
  check(
    "거부 사유 문구에 안내가 담긴다",
    (canCompleteInstall(job, deliveries("IN_TRANSIT"))?.reason ?? "").includes("배송 완료 이후"),
  );
}

console.log("\n== 지연 판정 ==");
{
  const past = new Date(NOW.getTime() - 2 * HOUR);
  const future = new Date(NOW.getTime() + 2 * HOUR);
  check("예정일 없음은 지연 아님", !isDeliveryDelayed({ scheduledAt: null, status: "SCHEDULED" }, NOW));
  check("미래 예정은 지연 아님", !isDeliveryDelayed({ scheduledAt: future, status: "SCHEDULED" }, NOW));
  check("과거 예정 + 진행중은 지연", isDeliveryDelayed({ scheduledAt: past, status: "IN_TRANSIT" }, NOW));
  check("과거 예정 + 완료는 지연 아님", !isDeliveryDelayed({ scheduledAt: past, status: "DELIVERED" }, NOW));
  check("과거 예정 + 취소는 지연 아님", !isDeliveryDelayed({ scheduledAt: past, status: "CANCELLED" }, NOW));
  check("과거 예정 + 실패는 지연 아님", !isDeliveryDelayed({ scheduledAt: past, status: "FAILED" }, NOW));
  check("설치도 같은 규칙", isInstallDelayed({ scheduledAt: past, status: "IN_PROGRESS" }, NOW));
  check("설치 완료는 지연 아님", !isInstallDelayed({ scheduledAt: past, status: "COMPLETED" }, NOW));
}

console.log("\n== 주문 진행도 파생 (부분 배송) ==");
{
  const make = (deliveries: string[], installs: string[] = [], status = "PLACED") => ({
    status,
    deliveryJobs: deliveries.map((s, i) => ({
      id: `d${i}`,
      orderItemId: `item-${i}`,
      status: s,
      scheduledAt: null,
    })),
    installJobs: installs.map((s, i) => ({
      orderItemId: `item-${i}`,
      deliveryJobId: `d${i}`,
      status: s,
      scheduledAt: null,
    })),
  });

  check("작업 없음 → PLACED", orderProgress(make([]), NOW).status === "PLACED");
  check("전부 예정 → PREPARING", orderProgress(make(["SCHEDULED", "SCHEDULED"]), NOW).status === "PREPARING");
  check("전부 배송중 → SHIPPING", orderProgress(make(["IN_TRANSIT", "IN_TRANSIT"]), NOW).status === "SHIPPING");

  // 핵심: 하나가 도착해도 가장 덜 진행된 쪽을 따른다.
  const partial = orderProgress(make(["DELIVERED", "PREPARING"]), NOW);
  check("부분 배송 → 가장 덜 진행된 작업을 따른다", partial.status === "PREPARING", partial.status);
  check("부분 배송 진행 카운트", partial.deliveryDone === 1 && partial.deliveryTotal === 2);

  const partialShipping = orderProgress(make(["DELIVERED", "IN_TRANSIT"]), NOW);
  check("하나 도착 + 하나 배송중 → SHIPPING", partialShipping.status === "SHIPPING", partialShipping.status);

  check(
    "설치 없이 전부 배송완료 → COMPLETED",
    orderProgress(make(["DELIVERED", "DELIVERED"]), NOW).status === "COMPLETED",
  );
  check(
    "배송완료 + 설치 미완 → DELIVERED",
    orderProgress(make(["DELIVERED"], ["IN_PROGRESS"]), NOW).status === "DELIVERED",
  );
  check(
    "배송완료 + 설치완료 → COMPLETED",
    orderProgress(make(["DELIVERED"], ["COMPLETED"]), NOW).status === "COMPLETED",
  );
  check(
    "취소된 배송은 집계에서 제외",
    orderProgress(make(["DELIVERED", "CANCELLED"]), NOW).status === "COMPLETED",
  );
  check("주문 취소는 그대로 CANCELLED", orderProgress(make(["SCHEDULED"], [], "CANCELLED"), NOW).status === "CANCELLED");

  const blocked = orderProgress(make(["IN_TRANSIT"], ["IN_PROGRESS"]), NOW);
  check("배송 대기 중인 설치를 센다", blocked.blockedInstalls === 1, String(blocked.blockedInstalls));
  const unblocked = orderProgress(make(["DELIVERED"], ["IN_PROGRESS"]), NOW);
  check("배송 완료되면 대기 아님", unblocked.blockedInstalls === 0, String(unblocked.blockedInstalls));

  const failed = orderProgress(make(["FAILED", "DELIVERED"]), NOW);
  check("실패 건수 집계", failed.failedCount === 1);
  check("실패가 있으면 완료로 가지 않는다", failed.status !== "COMPLETED", failed.status);
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
