/**
 * 전화번호 정규화. `Customer.phoneNormalized` 에 저장되는 값과 검색어를 같은 규칙으로 맞춘다.
 * 고객 생성/수정 경로에서는 반드시 이 함수 결과를 함께 써야 하이픈·공백 무관 검색이 동작한다.
 */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** 표시용 하이픈 포맷. 알 수 없는 자릿수는 입력값 그대로 돌려준다. */
export function formatPhone(value: string): string {
  const digits = normalizePhone(value);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return digits.startsWith("02")
      ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
      : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith("02")) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return value;
}
