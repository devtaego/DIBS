# 이용 이벤트 스키마 (데이터 분석 팀 공유용)

앱은 이벤트를 모아 `POST /events` 로 최대 100건씩 보냅니다. 서버는 `content_events` 테이블에 그대로 쌓고,
분석 팀은 `GET /admin/events/export?since_id=` 로 증분 추출합니다.

> 이 스키마는 앱·백엔드·데이터 분석 세 팀의 **계약**입니다. 필드나 이벤트 종류를 바꿀 때는 세 팀이 함께 합의하세요.

## 공통 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `event_type` | enum | ✅ | 아래 표 |
| `occurred_at` | datetime | ✅ | 클라이언트 발생 시각 (KST). 서버 수신 시각은 `received_at` 에 따로 저장 |
| `anon_id` | string | 비로그인 시 ✅ | 앱 설치 단위 식별자. 로그인 후에도 계속 보내면 로그인 전후 행동을 이을 수 있음 |
| `session_id` | string | 권장 | 앱 실행 ~ 30분 무활동까지 |
| `work_id` / `episode_id` / `short_id` / `funding_id` | int | 이벤트별 | |
| `progress` | float 0~1 | 열람 이벤트 | 스크롤(웹툰) 또는 글자 위치(웹소설) 비율 |
| `props` | object | 선택 | `platform`, `app_version`, `referrer`(home / shorts / search / push ...) |

로그인 상태면 서버가 토큰에서 `user_id` 를 채웁니다.

## 이벤트 종류

| event_type | 언제 | 필수 ID | 쓰이는 지표 |
|---|---|---|---|
| `WORK_VIEW` | 작품 상세 진입 | work_id | 상세 진입률 |
| `VIEW_START` | 회차 뷰어 진입 | work_id, episode_id | 신규 열람자, 회차별 시작 수 |
| `VIEW_PROGRESS` | 25 / 50 / 75% 지점 통과 | + progress | 이탈 지점 분석 |
| `VIEW_COMPLETE` | 회차 마지막(95% 이상) 도달 | work_id, episode_id | **연독률**, 완독률 |
| `VIEW_EXIT` | 뷰어 이탈 (완독 전) | + progress | 이탈 지점 분석 |
| `SHORT_PLAY` | 숏츠 재생 시작 | work_id, short_id | 숏츠 도달 |
| `SHORT_COMPLETE` | 숏츠 끝까지 시청 | work_id, short_id | 숏츠 완주율 |
| `FUNDING_VIEW` | 펀딩 상세 진입 | funding_id | 펀딩 퍼널 |
| `FUNDING_CTA` | 숏츠·작품 상세의 '펀딩 바로가기' 탭 | work_id, funding_id, props.referrer | 숏츠 → 펀딩 전환 |

찜·청약·유료 결제·주문은 서버가 직접 기록하는 **거래 데이터**(dibs, subscriptions, episode_unlocks, orders)라서 이벤트로 보내지 않습니다.
분석할 때는 이벤트 로그와 거래 테이블을 `user_id` 로 붙이세요.

## 지표 정의 (서버 `GET /works/{id}/metrics` 기준)

| 지표 | 정의 |
|---|---|
| 고유 사용자 | `user_id` 가 있으면 user_id, 없으면 anon_id |
| 완독률 (n화) | n화 `VIEW_COMPLETE` 고유 사용자 ÷ n화 `VIEW_START` 고유 사용자 |
| **연독률 (n화)** | n화 `VIEW_COMPLETE` 고유 사용자 ÷ 1화 `VIEW_COMPLETE` 고유 사용자 |
| 숏츠 → 펀딩 전환 | `FUNDING_CTA`(referrer=shorts) 고유 사용자 ÷ `SHORT_PLAY` 고유 사용자 |
| 찜 → 청약 전환 | 찜한 회원 중 해당 펀딩 청약 회원 비율 (dibs × subscriptions) |

정의를 바꾸면 `app/services/content.py::work_metrics` 와 이 표를 함께 고칩니다.

## 예시

```json
POST /events
{
  "events": [
    {"event_type": "VIEW_START", "occurred_at": "2027-03-02T21:03:11", "anon_id": "a1b2", "session_id": "s9",
     "work_id": 1, "episode_id": 3, "props": {"platform": "ios", "app_version": "0.1.0", "referrer": "home"}},
    {"event_type": "VIEW_EXIT", "occurred_at": "2027-03-02T21:05:40", "anon_id": "a1b2", "session_id": "s9",
     "work_id": 1, "episode_id": 3, "progress": 0.62}
  ]
}
```

## 개인정보

- 이벤트에는 이름·연락처 등 식별정보를 넣지 않습니다.
- 분석 환경으로 옮길 때 `user_id` 는 가명처리(해시)합니다.
