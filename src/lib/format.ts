// 서버 컴포넌트에서 렌더하므로 실행 환경의 시간대에 좌우되지 않도록 KST 를 고정한다.
const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(value: Date | null | undefined): string {
  return value ? DATE.format(value) : "-";
}

export function formatDateTime(value: Date | null | undefined): string {
  return value ? DATE_TIME.format(value) : "-";
}

/** `<input type="date">` 의 defaultValue 용 (KST 기준 YYYY-MM-DD). */
export function toDateInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  const parts = DATE.formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatKRW(value: number | null | undefined): string {
  return value == null ? "-" : `${value.toLocaleString("ko-KR")}원`;
}

/** "3시간 전" 상대 표기. 재고 기준시각(asOfAt)의 신선도를 한눈에 보여주는 데 쓴다. */
export function formatRelative(value: Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "-";
  const minutes = Math.floor((now.getTime() - value.getTime()) / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
