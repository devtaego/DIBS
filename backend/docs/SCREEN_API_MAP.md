# 화면 ↔ API 연결표 (v0.2)

기준: **프로토타입 HTML(8개 묶음, 58개 화면)** + **기획안 v3.0**. 프로토타입에 없는 크리에이터 스튜디오·어드민(웹)은 기획안 메뉴 기준입니다.
요청·응답 필드 상세는 `/docs`(Swagger)나 `API_SPEC.md`에 있습니다.

## 읽는 법

- **진입 시:** 화면을 열 때 부르는 API. 한 칸에 여러 개면 **동시에** 부르세요.
- **액션:** 버튼을 누를 때 부르는 API.
- **v3.0:** 프로토타입 화면에서 바꿔야 하는 점.
- 화면별 상세(분기·에러·이벤트)는 아래 [앱 화면 상세](#앱-iosandroid)에 있습니다.

## 모든 화면 공통

| 상황 | 처리 |
|---|---|
| 응답에 `mode: "MOCK"` | 투자 관련 금액 옆에 **'모의'** 배지 (지갑, 펀딩 참여, 마켓, 내 증권, 정산 리포트) |
| `401` (`UNAUTHORIZED`, `INVALID_TOKEN`) | 로그인 화면으로 |
| `KYC_REQUIRED` | 본인 인증 화면으로 보냈다가 원래 화면으로 복귀 |
| `RISK_PROFILE_REQUIRED` | 투자성향 확인 화면으로 (v3.0, 청약·매수 전 필수) |
| `LIVE_DISABLED` | "지금은 모의투자만 가능해요" 안내 (실거래 전환 전) |
| `422` `VALIDATION_ERROR` | `error.fields[].loc` 마지막 값이 입력칸 이름 → 해당 칸 아래에 표시 |
| 숫자 표시 | 금액은 원 단위 정수 → `toLocaleString()`. 비율은 bps → `/100` 해서 % |
| 목록 | `limit`·`offset`으로 무한 스크롤 |

---

## 프로토타입 화면별 연결

### 01 시작 · 가입 (9개)
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| 로딩 · 인트로 1~4 · 온보딩 | — (토큰이 있으면 `GET /me`) | — | 인트로 문구에서 "지분·주인" 표현을 "조각·수익권"으로 |
| 본인 인증 수단 · 휴대폰 번호 · 인증번호 | `GET /policies` (약관 동의 목록) | `POST /auth/dev-login` → `POST /auth/kyc/mock` | 실서비스는 제휴 증권사 비대면 인증으로 교체 |
| **(추가 필요) 투자성향 확인** | — | `POST /me/risk-profile {answers[5]}` | 청약·매수 전 필수. 처음 청약할 때 띄워도 됨 |

### 02 홈 · 탐색 (7개)
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| 오늘의 찜 IP | `GET /fundings?status=OPEN` (달성률·D-day 카드) | 카드 → 펀딩 상세 | — |
| 이번 주 지분 | `GET /market/securities?sort=change` | 종목 → 종목 상세 | 제목을 "이번 주 조각 시세"로 (지분 표현 금지) |
| 랭킹 · 가장 많이 찜한 | `GET /works?sort=dibs` | 찜 `PUT /works/{id}/dib` | — |
| 검색 | `GET /works?q=` · `GET /works?genre=` | — | — |
| 알림 | `GET /me/notifications` | `POST /me/notifications/{id}/read` | 새 알림 종류: 만기, 연재 중단 분배, 리워드 발송 |

### 03 숏츠 (6개)
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| 숏츠 피드 · 다음 작품 | `GET /shorts/feed` | 이벤트 `SHORT_PLAY`·`SHORT_COMPLETE` | — |
| 찜 효과 · 다음 화 찜 | — | `PUT /works/{id}/dib` | "찜하면 우선배정권" 문구 삭제 (v3.0은 균등+비례 배정) |
| 댓글 | `GET /works/{id}/posts?kind=SHORT_COMMENT&short_id=` | `POST /works/{id}/posts {kind:"SHORT_COMMENT", short_id, body}` · 신고 `POST /posts/{id}/report` | — |
| 투자 요약 | `GET /fundings/{id}` · `GET /fundings/{id}/breakeven` | 펀딩 바로가기 (이벤트 `FUNDING_CTA`) | 손익분기 독자 규모 한 줄 표시 |

### 04 펀딩 (후원) (4개) → **v3.0에서는 05 투자와 하나의 청약 흐름으로 합치기**
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| 리워드 펀딩 | `GET /fundings/{id}` (`reward_tiers`) | 리워드 선택은 청약 시트의 한 단계 | **'후원' 삭제** (기부형 후원 없음). 리워드는 청약에 딸린 선택 |
| 배송지 입력 · 우편번호 찾기 | — | 청약 요청의 `shipping` 필드로 함께 전송 | `requires_shipping` 리워드만 |
| 후원 완료 | `GET /fundings/{id}/subscriptions/me` | — | "청약 완료 (배정은 마감 후 확정)"으로 |

### 05 투자 (3개)
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| 투자 유의사항 | `GET /policies/investment-risk` · `GET /policies/no-principal-return` | 체크 2개 | **원금 상환 없음 동의 추가** (`agree_no_principal_return`) |
| 투자 금액 | `GET /wallet` · `GET /fundings/{id}/limits` · `GET /fundings/{id}/breakeven` | `POST /fundings/{id}/subscriptions {units, reward_tier_id, shipping, agree_risk_notice, agree_no_principal_return}` | 한도 잔액·손익분기 표시. "0조각 배정 가능" 문구 → "목표의 20%는 균등 배정" |
| 투자 완료 | `GET /fundings/{id}/subscriptions/me` | — | 배정 결과는 마감 후 알림(`ALLOCATED`) |

### 06 증권 · 조각 마켓 (10개)
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| 증권 홈 | `GET /me/holdings` · `GET /wallet` · `GET /me/subscriptions` | — | — |
| 조각 마켓 | `GET /market/securities` | — | 상승률 순위보다 "배당 대비 가격"을 함께 표시 |
| 종목 상세 · 호가 | `GET /market/securities/{id}` · `…/chart` · `…/orderbook` · `…/trades` | 호가 줄 → 매수 주문 | **최근 7일 거래량(`volume_7d`)·만기일·`price_to_dividend` 표시**, 주주 게시판 탭 |
| 매수 주문 | `GET /market/securities/{id}/order-preview` | `POST /market/orders` | "장외 마켓 오픈 대기" 문구는 실거래 전 안내로 유지 |
| 거래 내역 | `GET /me/orders` · `GET /wallet/history` | 미체결 취소 `DELETE /market/orders/{id}` | — |
| 정산 리포트 · 분기 정산 | `GET /me/dividends` · `GET /market/securities/{id}/dividends` | — | **"55%" → 주주 40%**, 외부 연재·수수료 적립분(`holder_direct`) 따로 표시. **"2차 판권 배당" 문구 삭제** |
| 예치금 충전 · 출금 | `GET /wallet` · `GET /wallet/deposit/withdrawals` | `POST /wallet/deposit/charge` · `POST /wallet/deposit/withdrawals` | — |
| 계좌 변경 | `GET /me` (`broker_name`, `broker_account_masked`) | `PUT /me/broker-account` | 예치금은 제휴 증권사 계좌에 보관된다는 안내 |

### 07 MY · 설정 (9개)
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| MY · 프로필 수정 | `GET /me` | `PATCH /me {nickname, bio, avatar_url}` | — |
| 보안 및 인증 | `GET /me` (`kyc_verified`, `risk_level`) | 투자성향 다시 하기 `POST /me/risk-profile` | — |
| 공지사항 · 공지 상세 | `GET /notices` · `GET /notices/{id}` | — | 종목 공시는 `category=DISCLOSURE` |
| 고객센터 | — | (API 없음, 외부 채널 연결) | — |
| 약관 상세 | `GET /policies/{key}` | — | 투자 위험·만기 고지·커뮤니티 정책 추가 |
| 앱 설정 | — (기기 저장) | — | 알림 묶음 설정은 다음 단계 |

### 08 작품 · 작가 · 커뮤니티 (10개)
| 화면 | 진입 시 | 액션 | v3.0 |
|---|---|---|---|
| 작품 상세 · 작가 탭 | `GET /works/{id}` · `GET /works/{id}/episodes` · `GET /works/{id}/shorts` | 찜 | 펀딩 상태별 CTA ([분기표](#펀딩-상태별-화면-분기)) |
| 회차 결제 (500P) · 포인트 충전 | `GET /wallet` (`coin`) | `POST /episodes/{id}/unlock` · `POST /wallet/coin/charge` | **'포인트'를 '코인'으로 통일**. 상장 전 작품은 전 회차 무료 |
| 회차 보기 | `GET /episodes/{id}` | 이벤트 `VIEW_START`/`PROGRESS`/`COMPLETE`/`EXIT` · 댓글 `kind=EPISODE_COMMENT` | — |
| 작가 프로필 | `GET /creators/{id}` | — | — |
| 게시판 글 · 답글 | `GET /works/{id}/posts?kind=BOARD` · `GET /posts/{id}/replies` | 작가만 글 `POST /works/{id}/posts`, 독자는 답글 `POST /posts/{id}/replies` | 신고 사유에 '창작 개입·압박'(`CREATIVE_PRESSURE`) |
| 팬아트 · 팬아트 올리기 | `GET /works/{id}/posts?kind=FANART` | `POST /works/{id}/posts {kind:"FANART", image_url, body}` | 이미지 업로드 API는 아직 없음 (URL) |
| **(추가 필요) 주주 게시판 탭** | `GET /works/{id}/posts?kind=HOLDER_BOARD` | 보유자만 쓰기 | 작품 댓글과 분리 (v3.0) |

### 프로토타입에 새로 넣어야 할 화면 (v3.0)

1. **투자성향 확인** (01 또는 첫 청약 직전)
2. **원금 상환 없음 동의** (05 투자 유의사항에 체크 1개 추가)
3. **손익분기 독자 규모** (05 투자 금액, 03 투자 요약)
4. **배정 결과** (신청 N조각 → 배정 M조각, 환불액): `GET /me/subscriptions`
5. **만기·연재 중단 안내** (종목 상세 상단 배너 + 알림)
6. **주주 게시판 탭** (08 작품 상세)

---

## 앱 (iOS·Android)

### 0. 로그인·본인인증
| 구분 | 내용 |
|---|---|
| 액션 | 로그인 `POST /auth/dev-login {email}` → `access_token` 저장 → `GET /me` |
| 액션 | 본인인증 `POST /auth/kyc/mock` → `kyc_verified: true` |
| 분기 | `GET /me`의 `kyc_verified=false`면 청약·주문 버튼을 누를 때 본인인증으로 보냄 (감상·찜은 인증 없이 가능) |
| 비고 | 실서비스는 휴대폰·간편인증으로 교체. 화면 흐름은 그대로 |

### 1. 홈
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /works?sort=dibs&limit=20` (찜 많은 작품) · `GET /fundings?status=OPEN` (모집 중) · `GET /market/securities?sort=change` (상장 종목 상위) |
| 표시 | 작품 카드: `title`, `cover_url`, `genre`, `dib_count`, 배지 = `funding_status` (`OPEN` 펀딩 중 / `LISTED` 상장 / 없음) |
| 표시 | 펀딩 카드: `work_title`, `progress.achievement_pct`(100% 넘을 수 있음, 예: 842%), `days_left`(D-7), `progress.participants` |
| 표시 | 종목 카드: `work_title`, `last_price`, `change_pct` (상승 빨강 / 하락 파랑) |
| 분기 | 장르 탭 → `GET /works?genre=로맨스 판타지`, 검색 → `GET /works?q=` |

### 2. 작품 상세
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /works/{id}` · `GET /works/{id}/episodes` · `GET /works/{id}/shorts` |
| 표시 | 줄거리, 작가, 회차 목록(`unlocked=false`면 자물쇠 + `price_coin`), 찜 버튼(`is_dibbed`), `dib_count` |
| 액션 | 찜 `PUT /works/{id}/dib`, 해제 `DELETE /works/{id}/dib` → 화면에서 바로 숫자 ±1 (낙관적 갱신) |
| 분기 | 하단 CTA는 `funding_status`로 결정 → [펀딩 상태별 분기](#펀딩-상태별-화면-분기) 참고 |
| 이벤트 | 진입 시 `WORK_VIEW` |

### 3. 콘텐츠 뷰어
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /episodes/{id}` → `content_url` 불러오기 |
| 분기 | `402 PAYMENT_REQUIRED` → 구매 시트 (`price_coin`, 내 코인은 `GET /wallet`의 `coin`) |
| 액션 | 구매 `POST /episodes/{id}/unlock` → 응답의 `content_url`로 바로 열람 |
| 에러 | `INSUFFICIENT_BALANCE` → "코인이 부족해요" + 지갑(코인 충전)으로 |
| 이벤트 | 진입 `VIEW_START` · 25/50/75% `VIEW_PROGRESS` · 95% 이상 `VIEW_COMPLETE` · 완독 전 이탈 `VIEW_EXIT(progress)` |
| 비고 | 발행 전 작품은 전 회차 무료라 402가 나오지 않음 |

### 4. 숏츠
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /shorts/feed?limit=20` (세로 스와이프, 끝에 가까워지면 `offset` 늘려서 다음 페이지) |
| 표시 | 영상, `work_title`, `funding_status=OPEN`이면 '펀딩 바로가기' 버튼 |
| 액션 | 펀딩 바로가기 → 5번 화면 (`funding_id`), 작품 보기 → 2번 화면 |
| 이벤트 | 재생 `SHORT_PLAY` · 끝까지 `SHORT_COMPLETE` · 버튼 `FUNDING_CTA(props.referrer="shorts")` |

### 5. 펀딩 상세
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /fundings/{id}` · (로그인 시) `GET /fundings/{id}/subscriptions/me` (404면 '청약 안 함') |
| 표시 | 달성률 `progress.achievement_pct`, 모인 금액 `progress.raised_amount`, 참여자 수, 목표 `target_amount`, 모집 기간 `open_at`~`close_at`, 조각 단가 `unit_price`, 1인 최대 `max_units_per_user` |
| 표시 | 리워드 티어 `reward_tiers[]` (최소 조각 수, 한정 수량), 자금 사용 계획 `use_of_funds`, 위험 `risk_note`, 배분율 `terms.*_bps` |
| 표시 | `lock_at` 이후에는 "감액·취소 불가" 안내 |
| 분기 | 내 청약 `ACTIVE` → '수량 변경' · `ALLOCATED` → "N조각 배정" · `REFUNDED` → "환불 완료" |
| 갱신 | 모집 중에는 달성률을 30초마다 다시 불러오기 (`GET /fundings/{id}`) |
| 이벤트 | 진입 `FUNDING_VIEW` |

### 6. 펀딩 참여 (시트)
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /wallet` (`deposit_available`) · `GET /fundings/{id}/limits` (`annual_remaining`, `security_remaining`) |
| 입력 | 조각 수 → 금액 = 조각 수 × `unit_price` (화면에서 계산) · 리워드 선택 · 배송지 (`requires_shipping` 티어만) · 위험 고지 동의 체크 |
| 액션 | 신규 `POST /fundings/{id}/subscriptions {units, reward_tier_id, shipping, agree_risk_notice: true, agree_no_principal_return: true}` |
| 액션 | 변경 `PATCH /fundings/{id}/subscriptions/me` · 취소 `DELETE /fundings/{id}/subscriptions/me` |
| 성공 후 | 시트 닫고 5번 화면 다시 불러오기 |
| 에러 | `RISK_PROFILE_REQUIRED` · `NO_PRINCIPAL_NOTICE_REQUIRED` · `INSUFFICIENT_BALANCE`(예치금 부족 → 지갑) · `MAX_UNITS_EXCEEDED` · `SECURITY_LIMIT_EXCEEDED` / `ANNUAL_LIMIT_EXCEEDED` · `TIER_MIN_UNITS` · `TIER_SOLD_OUT` · `SHIPPING_REQUIRED` · `SUBSCRIPTION_LOCKED` · `FUNDING_NOT_IN_PERIOD` · `SELF_INVEST_FORBIDDEN` · `RISK_NOTICE_REQUIRED` |
| 안내 문구 | "목표를 넘으면 목표의 20%는 참여자에게 고르게, 나머지는 청약 비율대로 배정돼요." "운용 기간 3년이 끝나면 상장폐지되고 원금은 상환되지 않아요." "펀딩 성공이 투자 수익을 보장하지 않아요." |

### 7. 마켓 (종목 순위)
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /market/securities?sort=change` (등락률 순) / `sort=latest` (최근 상장 순) |
| 표시 | `work_title`, `last_price`, `change_pct`, `status=SUSPENDED`면 '거래 정지' 배지 |

### 8. 종목 상세
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /market/securities/{id}` · `GET …/chart?days=30` · `GET …/orderbook` · `GET …/trades?limit=20` · `GET …/dividends` |
| 표시 | 상단: `last_price`, `change_pct`, 공모가 `unit_price`, 가격제한 `price_band.min~max`, 내 보유 `my_units`·`my_avg_price` |
| 표시 | 차트: 일봉 `date, open, high, low, close, volume` (체결 없는 날은 빈칸) |
| 표시 | 호가: `asks`(매도, 낮은 가격부터) / `bids`(매수, 높은 가격부터) — **같은 가격끼리만 체결**되므로 가격별 잔량을 보여 주는 게 핵심 |
| 표시 | 배당: `cumulative_dividend_per_unit`, 최근 `last_dividend.per_unit_gross` |
| 갱신 | 화면이 열려 있는 동안 호가·체결을 5초마다 다시 불러오기 (WebSocket은 아직 없음) |
| 분기 | `status=SUSPENDED` → 매수·매도 버튼 비활성 + 거래 정지 안내 |

### 9. 주문
| 구분 | 내용 |
|---|---|
| 입력 | 매수/매도, 가격(지정가), 수량. 호가 줄을 누르면 그 가격 자동 입력 |
| 입력 중 | `GET /market/securities/{id}/order-preview?side&price&units` (입력이 멈추고 300ms 뒤 호출) |
| 표시 | `fee`·`fee_bps`, `total`(매수: 결제 예정액 / 매도: 수령 예정액), `available_deposit` 또는 `available_units`, 남은 한도 |
| 분기 | `can_place=false`면 주문 버튼 비활성 + `reasons[]` 첫 번째 코드로 안내 |
| 액션 | `POST /market/orders {funding_id, side, price, units, agree_risk_notice: true}` |
| 결과 | 응답 `status`: `FILLED` "체결됐어요" · `PARTIAL` "일부 체결, 나머지는 대기 중" · `OPEN` "같은 가격의 상대 주문을 기다려요" |
| 에러 | `PRICE_OUT_OF_BAND` · `INSUFFICIENT_BALANCE` · `INSUFFICIENT_UNITS` · `MARKET_MAINTENANCE`(04:00~04:30) · `NOT_TRADABLE` · `SELF_TRADE_FORBIDDEN` · 한도 초과 |
| 안내 문구 | "미체결 주문은 자정에 자동 취소돼요." "원금 손실이 날 수 있고 예금자 보호 대상이 아니에요." |

### 10. 내 증권 (탭 3개)
| 탭 | API | 표시 |
|---|---|---|
| 보유 | `GET /me/holdings` | `work_title`, `units`(매도 대기 `locked_units`), `avg_price`, `eval_amount`, `pnl`, `pnl_pct` |
| 청약 | `GET /me/subscriptions` | `work_title`, 청약 `units` → 배정 `allocated_units`, `status`, 리워드 `assigned_tier_title`(변경되면 `requested_tier_title`과 비교해 표시), 배송 `tracking_no` |
| 미체결 | `GET /me/orders?open_only=true` | 가격, `remaining_units`, 취소 버튼 → `DELETE /market/orders/{id}` |

### 11. 지갑
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /wallet` · `GET /wallet/history?limit=50` · `GET /wallet/deposit/withdrawals` |
| 표시 | **코인**(콘텐츠용)과 **예치금**(투자용)을 카드 2장으로 분리. 예치금은 `deposit_available` + 묶인 금액 `deposit_locked` |
| 액션 | 코인 충전 `POST /wallet/coin/charge` · 예치금 입금 `POST /wallet/deposit/charge` · 출금 `POST /wallet/deposit/withdrawals`(운영자 승인 대기) · 예치금→코인 `POST /wallet/deposit/to-coin` |
| 분기 | 모의 모드에서는 '예치금→코인' 버튼을 숨기거나 비활성 (`MOCK_DEPOSIT_TO_COIN`) |
| 비고 | 코인→예치금 버튼은 만들지 않음 (서버에서도 막혀 있음) |
| 내역 문구 | `history[].kind` → `COIN_CHARGE` 코인 충전 · `EPISODE_UNLOCK` 회차 구매 · `DEPOSIT_IN` 입금 · `SUBSCRIPTION_LOCK` 청약 · `FUNDING_ALLOCATION` 배정·환불 · `FUNDING_FAILED_RELEASE` 펀딩 실패 해제 · `TRADE` 체결 · `ORDER_LOCK`/`ORDER_UNLOCK` 주문 · `DIVIDEND_PAYOUT` 배당 · `WITHDRAWAL_*` 출금 |

### 12. 정산 리포트
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /me/dividends` |
| 표시 | 분기(`period`)별 묶음: `work_title`, 보유 `units`, 세전 `gross`, 원천징수 `tax`(15.4%), 실입금 `net`, 지급일 `pay_date`, `status` (`CALCULATED` 지급 예정 / `PAID` 지급 완료) |

### + 알림
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /me/notifications` (뱃지 숫자는 `?unread_only=true`의 개수) |
| 액션 | 누르면 `POST /me/notifications/{id}/read` → `ref_type`/`ref_id`로 이동 (`funding` → 5번, `dividend_run` → 12번) |
| 종류 | `DIBBED_FUNDING_OPEN` · `ALLOCATED` · `ALLOCATED_ZERO` · `REWARD_CHANGED` · `FUNDING_FAILED` · `ISSUE_FAILED` · `LISTED` · `REWARD_SHIPPED` · `DIVIDEND_PAID` · `CREATOR_PAYOUT` |

---

## 크리에이터 스튜디오 (웹, role=CREATOR)

### S1. 작품·회차·숏츠 등록
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /studio/works` (작성 중·심사 중·반려 포함, 반려 사유 `review_note`) |
| 액션 | 작품 `POST /works {…, rights_declared: true}` → 회차 `POST /works/{id}/episodes` → 숏츠 `POST /works/{id}/shorts`(60초 이하) → 심사 요청 `POST /works/{id}/submit` |
| 액션 | 수정 `PATCH /works/{id}` · 회차·숏츠 목록 `GET /works/{id}/episodes`, `GET /works/{id}/shorts` |
| 에러 | `RIGHTS_NOT_DECLARED` · `NO_EPISODES` · `EPISODE_NO_EXISTS` |
| 비고 | 이미지·영상 파일 업로드는 아직 없음 → 지금은 URL 입력 |

### S2. 펀딩 신청
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /studio/fundings` (심사 중·반려 포함) |
| 액션 | `POST /works/{id}/fundings {target_units, unit_price, open_at, close_at, use_of_funds, reward_tiers[≤5]}` |
| 에러 | `WORK_NOT_PUBLISHED` · `FUNDING_ALREADY_ACTIVE` · `INVALID_TERMS`(기간 7~60일, 목표 100만~5억) · `TOO_MANY_TIERS` |
| 비고 | 단가·배분율·배정 방식은 운영자가 심사에서 확정 → 상세 `GET /studio/fundings/{id}`의 `terms` |

### S3. 통계
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /works/{id}/metrics` · (펀딩 중이면) `GET /studio/fundings/{id}` |
| 표시 | 상세 진입, 고유 독자, 찜, 숏츠 재생, 펀딩 버튼 클릭, 회차별 완독률·**연독률** 그래프, 펀딩 달성률 |

### S4. 리워드 배송
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /studio/fundings/{id}/shipments` (배정 확정 뒤에만 생김) |
| 표시 | 닉네임, 리워드, 배정 조각 수, 배송지(배송이 필요한 리워드만), 송장 |
| 액션 | `PUT /studio/fundings/{id}/shipments/{subscription_id} {carrier, tracking_no}` → 회원에게 `REWARD_SHIPPED` 알림 |

### S5. 정산
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /studio/settlements` |
| 표시 | 펀딩별: 펀딩 지급분 `payouts[]`(회차·비율·금액·상태), 분기 저작권료 `royalties[]`(분기·순매출·작가 몫·상태), 누적 지급 `paid_total` |

---

## 어드민 (웹, role=ADMIN)

### A1. 작품 심사
| 구분 | 내용 |
|---|---|
| 진입 시 | `GET /admin/works?status=IN_REVIEW` → 행 선택 `GET /admin/works/{id}` (`rights_declared`, `prior_contract_note`) |
| 액션 | 승인·반려 `POST /admin/works/{id}/review {approve, note}` · 권리 분쟁 시 `POST /admin/works/{id}/hide {reason}` |

### A2. 펀딩 관리
| 단계 | API |
|---|---|
| 목록 | `GET /admin/fundings?status=IN_REVIEW` (상태 탭별) |
| 심사 지표 | `GET /admin/works/{work_id}/review-metrics` (본인인증 계정만 센 찜·연독률, 조작 의심 `flags`) |
| 심사·조건 확정 | `GET /admin/fundings/{id}` → `POST /admin/fundings/{id}/review {approve, terms, payout_schedule}` (생략 시 v3.0 기본값: 균등 20%+비례, 지급 40/30/30, 운용 3년) |
| 모집 시작 | `POST /admin/fundings/{id}/open` (찜한 회원에게 알림이 감) |
| 마감 | `POST /admin/fundings/{id}/close` (시연 중에는 `?force=true`) → 응답 `allocations[]`가 배정표 |
| 배정표 | `GET /admin/fundings/{id}/subscriptions` |

### A3. 회차 가격 관리
| 구분 | 내용 |
|---|---|
| 진입 시 | 상장 작품 목록 `GET /market/securities` → `GET /works/{work_id}/episodes` |
| 액션 | `PATCH /admin/episodes/{id}/pricing {is_paid, price_coin}` |
| 에러 | `NOT_LISTED_WORK` (상장 전에는 유료 지정 불가) |

### A4. 발행·상장
| 단계 | API |
|---|---|
| 발행 요청 | `POST /admin/fundings/{id}/issuance {broker_name}` |
| 단계 진행 | `POST …/issuance/advance` 를 `FILED` → `ISSUED {security_code, trustee}` → `LISTING_SCHEDULED {listing_date}` → `LISTED` 순서로 4번 (`LISTED` 때 보유 증권 반영·작가 지급) |
| 현황 | `GET …/issuance` (`history[]`로 진행 바 표시) · `GET …/payouts` |
| 실패 | `POST …/issuance/fail {reason}` (전액 환불·리워드 취소) |
| 거래 정지 | `POST …/suspension {suspended, reason}` (정지하면 미체결 주문 전부 취소) |
| 마일스톤 지급 | `POST …/payouts/{seq}/pay` (10화 연재, 20화 또는 완결 확인 후) |
| 연재 중단 확정 | `POST …/discontinue {reason}` → 남은 작가 지급분을 주주에게 분배, 거래 정지 |
| 만기 | `POST …/mature` (만기일 전이면 `MATURITY_NOT_REACHED`, 시연은 `?force=true`) → 상장폐지 |

### A5. 매출·정산
| 단계 | API |
|---|---|
| 유료 회차 매출 | `POST /admin/fundings/{id}/revenues/aggregate {period}` (코인 매출 자동 집계, 인앱 수수료 공제) |
| 광고·굿즈 매출 | `POST /admin/revenues {funding_id, period, source, gross, deductions, evidence_url}` |
| 외부 연재 수익 | `POST /admin/revenues {source:"EXTERNAL_SERIAL", gross:<작가 몫>, evidence_url:<정산서>}` → 20%만 재원, 전액 주주 몫 (선공개 기간 중이면 `EXCLUSIVE_PERIOD`) |
| 확인 | `GET /admin/fundings/{id}/revenues?period=` |
| 배당 계산 | `POST /admin/fundings/{id}/dividends {period}` → 주주 몫·작가 몫·주당 배당금 미리 보기 (분기가 끝나기 전이면 `PERIOD_NOT_ENDED`, 시연 중에는 `?force=true`) |
| 배당 지급 | `POST /admin/dividends/{run_id}/pay` (지급일 전이면 `BEFORE_PAY_DATE`, 시연 중에는 `?force=true`) |
| 입출금 승인 | `GET /admin/withdrawals` → `POST /admin/withdrawals/{id}/decision {approve}` |
| 점검 | `GET /admin/ledger/trial-balance` (모드별 합계 0이면 정상) |
| 수수료 적립분 | 배당 계산 때 자동 집계 (`FEE_RESERVE`, 전액 주주 몫) |
| 배치(수동) | `POST /admin/jobs/expire-orders`(자정) · `POST /admin/jobs/roll-reference-prices`(04:00) |

---

## 펀딩 상태별 화면 분기

| `funding_status` | 작품 상세 CTA | 펀딩 상세 버튼 | 내 증권 > 청약 탭 | 마켓 |
|---|---|---|---|---|
| 없음 | 찜하기만 | — | — | — |
| `OPEN` | **펀딩 참여하기** (D-day) | 참여하기 / 수량 변경 (`lock_at` 이후 감액 불가) | 청약 중 | — |
| `FAILED` | 찜하기 | "목표 미달로 종료" | 환불 완료 | — |
| `ALLOCATED` · `ISSUING` | "발행 준비 중" | 배정 결과 | N조각 배정, 발행 중 | — |
| `ISSUE_FAILED` | 찜하기 | "발행 무산, 전액 환불" | 환불 완료 | — |
| `LISTED` | **마켓에서 보기** | 종목 상세로 이동 | 배정 완료 (보유 탭에서 확인) | 거래 가능 |
| `SUSPENDED` | "거래 정지" (연재 중단이면 `discontinued_at` 안내) | 종목 상세로 이동 | 배정 완료 | 거래 정지 배지, 주문 불가 |
| `MATURED` | "운용 종료" | 종목 상세로 이동 | 만기 | 상장폐지 배지, 마지막 배당만 표시 |

---

## 발표 시연 순서 (API 호출 순서)

데모 데이터: `python -m scripts.seed_demo` (작품 A: 1,000만 원 목표에 842% 모집 중, 작품 B: 상장·호가·주주 게시판 글 있음)

1. 로그인 → 홈 (`/works`, `/fundings`, `/market/securities`)
2. 작품 A 상세 → 1화 감상 → 찜
3. **reader30**(청약 안 한 계정) 로그인 → 숏츠 → 펀딩 바로가기 → 펀딩 상세 (842%, 손익분기 표시) → 투자 유의사항 2개 동의 → 청약
   (reader1~29는 데모 데이터에서 이미 청약해서 '수량 변경'만 가능)
4. **admin** 펀딩 마감 `close?force=true` → 배정표 확인
5. reader30 내 증권 > 청약 탭: "신청 N조각 → 균등+비례로 M조각 배정": "N조각 배정, 나머지 환불"
6. admin 발행 단계 4번 → 상장 → **creator** 스튜디오 정산: 상장 지급 40%, 마일스톤 2회 대기
7. 작품 B 종목 상세 → 호가 줄 눌러 매수 → 즉시 체결
8. admin 작품 B 회차 유료 지정 → reader 코인으로 구매 → 이번 분기 매출 집계 → 배당 계산·지급(둘 다 `?force=true`) → 정산 리포트

---

### A6. 어드민: 커뮤니티·공지
| 단계 | API |
|---|---|
| 신고된 글 | `GET /admin/reports` (신고 수·사유) |
| 숨김·복구 | `POST /admin/posts/{id}/visibility {hidden}` |
| 공지·종목 공시 | `POST /admin/notices {title, body, category, funding_id, is_pinned}` |

---

## v0.2에서 추가한 API (프로토타입 화면 + 기획안 v3.0)

| API | 쓰는 화면 |
|---|---|
| `POST /me/risk-profile` | 투자성향 확인 (추가 화면) |
| `PATCH /me`, `PUT /me/broker-account` | 07 프로필 수정, 06 계좌 변경 |
| `GET /fundings/{id}/breakeven` | 03 투자 요약, 05 투자 금액 |
| 청약 요청에 `agree_no_principal_return` | 05 투자 유의사항 |
| `GET /works/{id}/posts`, `POST /works/{id}/posts`, `GET·POST /posts/{id}/replies`, `DELETE /posts/{id}`, `POST /posts/{id}/report` | 03 댓글, 08 게시판·답글·팬아트·주주 게시판 |
| `PUT·DELETE /users/{id}/block` | 08 커뮤니티 |
| `GET /creators/{id}` | 08 작가 프로필 |
| `GET /notices`, `GET /notices/{id}`, `GET /policies`, `GET /policies/{key}` | 07 공지사항·약관 |
| 종목 상세 응답에 `volume_7d`, `trades_7d`, `dividend_4q_per_unit`, `price_to_dividend`, `maturity_date` | 06 종목 상세 |
| `GET /admin/works/{id}/review-metrics`, `POST /admin/fundings/{id}/discontinue`, `POST /admin/fundings/{id}/mature`, `GET /admin/reports`, `POST /admin/posts/{id}/visibility`, `POST /admin/notices` | 어드민 |

## v0.1에서 추가한 API

| API | 쓰는 화면 |
|---|---|
| `GET /works` 응답에 `dib_count`, `funding_id`, `funding_status` 추가 | 1 홈 |
| `GET /fundings` 응답에 `work_title`, `cover_url`, `progress`, `days_left` 추가 | 1 홈 |
| `GET /works/{id}/shorts` | 2 작품 상세, S1 |
| `GET /market/securities/{id}` | 8 종목 상세 |
| `GET /market/securities/{id}/chart` | 8 종목 상세 |
| `GET /market/securities/{id}/order-preview` | 9 주문 |
| `GET /me/subscriptions` 응답에 작품명·리워드명·송장 추가 | 10 내 증권 |
| `GET /wallet/deposit/withdrawals` | 11 지갑 |
| `GET /studio/works`, `/studio/fundings`, `/studio/fundings/{id}` | S1~S3 |
| `GET /studio/fundings/{id}/shipments`, `PUT …/shipments/{subscription_id}` | S4 |
| `GET /studio/settlements` | S5 |
| `GET /admin/works/{id}`, `GET /admin/fundings/{id}` | A1, A2 |

## 아직 없는 것 (필요하면 다음에)

| 항목 | 지금 대안 |
|---|---|
| 이미지·영상 업로드 (저장소 업로드용 URL 발급) | URL 직접 입력 |
| 실시간 호가·체결 (WebSocket) | 5초 폴링 |
| 푸시 알림 발송 | 알림 목록 조회만 |
| 분봉 차트 | 일봉만 |
| 투자성향 진단(적합성) | 기획 결정 필요 |
| 프로필 수정·회원 탈퇴 | — |
| 리워드 배송 목록 CSV 내려받기 | 화면 표 복사 |
| 장르 목록 API | 앱에 상수로 |
