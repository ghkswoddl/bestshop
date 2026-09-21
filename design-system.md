# LG Bestshop 디자인시스템

## 1. 개요
- 목적: LG Bestshop 상담/판매 지원 서비스 전반의 UI 일관성 확보
- 적용범위: 웹/태블릿 기반 매니저용 업무 화면
- 원칙: 명확성(Clarity), 신뢰성(Trust), 효율성(Efficiency)

## 2. 브랜드 컬러

### Primary
| 이름 | 값 | 용도 |
|---|---|---|
| LG Red | #A50034 | 주요 액션, 강조, 로고 |
| LG Red Dark | #7A0026 | 호버/눌림 상태 |
| LG Red Light | #F5E6EB | 배경 강조 영역 |

### Neutral
| 이름 | 값 | 용도 |
|---|---|---|
| Gray 900 | #1A1A1A | 본문 텍스트 |
| Gray 700 | #4D4D4D | 보조 텍스트 |
| Gray 400 | #B3B3B3 | 비활성/플레이스홀더 |
| Gray 200 | #E5E5E5 | 구분선, 테두리 |
| Gray 100 | #F5F5F5 | 배경 |
| White | #FFFFFF | 카드/컨텐츠 배경 |

### Semantic
| 이름 | 값 | 용도 |
|---|---|---|
| Success | #1E8A4C | 완료, 정상 상태 |
| Warning | #E8A317 | 주의, 대기 상태 |
| Error | #D32F2F | 오류, 재고부족 |
| Info | #2E6FDB | 안내, 정보성 메시지 |

## 3. 타이포그래피

- 기본 서체: Pretendard, -apple-system, sans-serif
- 숫자/가격 표기: 고정폭 숫자(Tabular Numbers) 사용

| 스타일 | 크기 | 굵기 | 용도 |
|---|---|---|---|
| Display | 28px | Bold | 대시보드 주요 지표 |
| H1 | 24px | Bold | 페이지 타이틀 |
| H2 | 20px | Bold | 섹션 타이틀 |
| H3 | 16px | SemiBold | 카드/그룹 타이틀 |
| Body | 14px | Regular | 본문 |
| Caption | 12px | Regular | 보조설명, 라벨 |
| Button | 14px | SemiBold | 버튼 텍스트 |

## 4. 간격 및 레이아웃

- 기준 단위: 4px
- 간격 스케일: 4 / 8 / 12 / 16 / 24 / 32 / 48
- 그리드: 12 컬럼, 컨테이너 최대폭 1440px
- 카드 radius: 8px
- 버튼/입력창 radius: 6px

## 5. 컴포넌트

### 버튼
| 종류 | 배경 | 텍스트 | 용도 |
|---|---|---|---|
| Primary | LG Red | White | 주요 액션(결제, 서명 등) |
| Secondary | White + Gray 200 테두리 | Gray 900 | 보조 액션 |
| Ghost | 투명 | LG Red | 텍스트형 액션 |
| Disabled | Gray 200 | Gray 400 | 비활성 |

### 입력요소
- 텍스트필드: 높이 40px, 테두리 Gray 200, 포커스 시 LG Red 테두리
- 드롭다운/셀렉트: 텍스트필드와 동일 스타일 + 화살표 아이콘
- 체크박스/라디오: LG Red 컬러 적용

### 카드
- 배경 White, 테두리 Gray 200 또는 그림자(0 1px 4px rgba(0,0,0,0.08))
- 내부 padding 16px, 항목 간 간격 12px

### 상태 배지(Badge)
| 상태 | 컬러 |
|---|---|
| 재고있음 | Success |
| 재고부족 | Warning |
| 품절 | Error |
| 배송중 | Info |

### 테이블
- 헤더: Gray 100 배경, Gray 700 텍스트, Bold
- 행 구분선: Gray 200
- 행 호버: Gray 100 배경

### 모달/다이얼로그
- 배경 오버레이: rgba(0,0,0,0.5)
- 컨텐츠 radius 12px, 최대폭 480px(기본)/720px(대형, 견적서·계약서용)

## 6. 아이콘
- 스타일: Outline 기반, 2px stroke
- 크기: 16px(인라인) / 20px(기본) / 24px(주요 액션)
- 컬러: 기본 Gray 700, 강조 시 LG Red

## 7. 접근성
- 텍스트 대비: 본문 기준 WCAG AA(4.5:1) 이상 준수
- 클릭 영역 최소 40x40px
- 상태 전달 시 컬러 단독 사용 금지(아이콘/텍스트 병행)

## 8. 적용 예시(화면 매핑)
| 화면 | 주요 컴포넌트 |
|---|---|
| 상담대시보드 | 카드, 배지, Display 타이포 |
| 고객조회 | 텍스트필드, 테이블 |
| 상품비교 | 테이블, 카드 |
| 재고 및 매장확인 | 배지, 테이블 |
| 견적서 작성 | 대형 모달, 입력요소 |
| 계약확인 및 전자서명 | 대형 모달, Primary 버튼 |
| 배송 및 설치 추적 | 배지, 타임라인(카드 연속 배치) |
