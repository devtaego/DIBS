# DIBS API 명세 (v0.1 초안)

> 이 문서는 `python -m scripts.export_docs` 로 코드에서 생성됩니다. 직접 고치지 말고 코드를 고친 뒤 다시 생성하세요.
> 요청·응답 필드 상세는 서버 실행 후 `/docs`(Swagger UI) 또는 `docs/openapi.json` 을 보세요.

## 공통 규칙

| 항목 | 규칙 |
|---|---|
| 인증 | `Authorization: Bearer <token>` (개발용 `POST /auth/dev-login` 으로 발급) |
| 금액 | 원 단위 정수 (소수 없음) |
| 비율 | bps 정수 (10000 = 100%, 3000 = 30%) |
| 시각 | KST 기준 ISO 8601 (`2027-03-02T10:00:00`) |
| 모드 | 투자 기능은 `MOCK`(모의) 기본. 응답의 `mode` 로 화면에 '모의' 배지 표시 |
| 에러 | `{"error": {"code": "SUBSCRIPTION_LOCKED", "message": "..."}}` — 프런트는 `code` 로 분기 |
| 목록 | `limit`, `offset` 쿼리 (기본 20~50) |

권한: **공개**(토큰 불필요) · **선택**(로그인 시 개인화) · **회원** · **창작자** · **운영자**

## auth — 로그인·본인인증 (개발용 모의)

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `POST` | `/auth/dev-login` | 개발용 로그인 (없으면 가입) | 공개 | DevLoginIn | TokenOut |
| `POST` | `/auth/kyc/mock` | 모의 본인인증 완료 처리 | 회원 |  | UserOut |
| `GET` | `/health` | 헬스체크 | 공개 |  |  |

## works — 작품·회차·숏츠·찜 (STEP 1)

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/works` | 작품 목록 (홈 카드: 찜 수·펀딩/상장 상태 포함) | 공개 |  | WorkCardOut[] |
| `POST` | `/works` | 작품 등록 (창작자) | 창작자 | WorkIn | WorkOut |
| `GET` | `/works/{work_id}` | 작품 상세 | 선택 |  | WorkDetailOut |
| `PATCH` | `/works/{work_id}` | 작품 정보 수정 | 창작자 | WorkPatch | WorkOut |
| `POST` | `/works/{work_id}/submit` | 공개 심사 요청 | 창작자 |  | WorkOut |
| `GET` | `/works/{work_id}/episodes` | 회차 목록 | 선택 |  | EpisodeListItem[] |
| `POST` | `/works/{work_id}/episodes` | 회차 등록 | 창작자 | EpisodeIn | EpisodeOut |
| `GET` | `/episodes/{episode_id}` | 회차 열람 | 선택 |  | EpisodeContentOut |
| `POST` | `/episodes/{episode_id}/unlock` | 유료 회차 구매 (코인) | 회원 |  | EpisodeContentOut |
| `POST` | `/works/{work_id}/shorts` | 숏츠 등록 | 창작자 | ShortIn | ShortOut |
| `GET` | `/works/{work_id}/shorts` | 작품의 숏츠 목록 | 선택 |  | ShortOut[] |
| `GET` | `/shorts/feed` | 숏츠 피드 (펀딩 바로가기 포함) | 공개 |  | ShortFeedItem[] |
| `PUT` | `/works/{work_id}/dib` | 찜하기 | 회원 |  | OK |
| `DELETE` | `/works/{work_id}/dib` | 찜 해제 | 회원 |  | OK |
| `GET` | `/works/{work_id}/metrics` | 작품 지표 (창작자·운영자) | 창작자 |  | WorkMetricsOut |

## community — 댓글·작가 게시판·팬아트·주주 게시판·신고·차단

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/works/{work_id}/posts` | 작품 글 목록 (댓글·게시판·팬아트·주주 게시판) | 선택 |  | PostOut[] |
| `POST` | `/works/{work_id}/posts` | 글 쓰기 | 회원 | PostIn | PostOut |
| `GET` | `/posts/{post_id}/replies` | 답글 목록 | 선택 |  | PostOut[] |
| `POST` | `/posts/{post_id}/replies` | 답글 쓰기 | 회원 | ReplyIn | PostOut |
| `DELETE` | `/posts/{post_id}` | 글 삭제 (작성자·운영자) | 회원 |  | OK |
| `POST` | `/posts/{post_id}/report` | 신고 (3건이면 자동 숨김) | 회원 | ReportIn | ReportOut |
| `PUT` | `/users/{user_id}/block` | 차단 (그 사람 글이 안 보임) | 회원 |  | OK |
| `DELETE` | `/users/{user_id}/block` | 차단 해제 | 회원 |  | OK |

## info — 작가 프로필·공지(종목 공시)·약관

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/creators/{user_id}` | 작가 프로필 (공개 작품 포함) | 공개 |  | CreatorOut |
| `GET` | `/notices` | 공지사항·종목 공시 | 공개 |  | NoticeOut[] |
| `GET` | `/notices/{notice_id}` | 공지 상세 | 공개 |  | NoticeOut |
| `GET` | `/policies` | 약관·고지 문서 목록 | 공개 |  | PolicyOut[] |
| `GET` | `/policies/{key}` | 약관 상세 | 공개 |  | PolicyOut |

## events — 이용 데이터 수집 (찜·연독률·전환 분석 원천)

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `POST` | `/events` | 이용 이벤트 배치 수집 | 선택 | EventBatchIn | EventBatchOut |

## wallet — 콘텐츠용 코인 / 투자용 예치금 (분리 관리)

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/wallet` | 지갑 잔액 (코인 / 예치금) | 회원 |  | WalletOut |
| `POST` | `/wallet/coin/charge` | 코인 충전 (PG 모의) | 회원 | AmountIn | WalletOut |
| `POST` | `/wallet/deposit/charge` | 예치금 입금 (모의 모드: 모의 예치금 지급) | 회원 | AmountIn | WalletOut |
| `POST` | `/wallet/deposit/to-coin` | 예치금 → 코인 전환 (실거래 모드만) | 회원 | AmountIn | WalletOut |
| `POST` | `/wallet/deposit/withdrawals` | 예치금 출금 요청 (운영자 승인) | 회원 | AmountIn | WithdrawalOut |
| `GET` | `/wallet/deposit/withdrawals` | 내 출금 요청 내역 | 회원 |  | WithdrawalOut[] |
| `GET` | `/wallet/history` | 입출금·거래 원장 내역 | 회원 |  | LedgerLineOut[] |

## fundings — 펀딩 = 조각 청약 (STEP 2~3)

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/fundings` | 펀딩 목록 (카드: 작품명·달성률·D-day) | 공개 |  | FundingCardOut[] |
| `GET` | `/fundings/{funding_id}` | 펀딩 상세 (조건·달성률·리워드) | 공개 |  | FundingDetailOut |
| `POST` | `/works/{work_id}/fundings` | 펀딩 신청 (창작자) → 운영자 심사 대기 | 창작자 | FundingApplyIn | FundingDetailOut |
| `GET` | `/fundings/{funding_id}/limits` | 내 남은 투자 한도 | 회원 |  | LimitsOut |
| `POST` | `/fundings/{funding_id}/subscriptions` | 조각 청약 (예치금 묶임) | 회원 | SubscribeIn | SubscriptionOut |
| `GET` | `/fundings/{funding_id}/breakeven` | 손익분기 독자 규모 (청약 전 공시) | 공개 |  | BreakevenOut |
| `GET` | `/works/{work_id}/funding-gate` | 펀딩 개설 조건·목표 금액 상한 (파일럿 4주 열람자 기준) | 공개 |  | FundingGateOut |
| `GET` | `/fundings/{funding_id}/buyback-quote` | 종료 규칙 상태와 작가 매입가 (상장 후) | 공개 |  | TerminationOut |
| `POST` | `/fundings/{funding_id}/buyback` | 작가 매입 옵션 실행 (작가 본인, 전량 매입 후 권리 종료) | 창작자 |  |  |
| `GET` | `/fundings/{funding_id}/subscriptions/me` | 내 청약 조회 | 회원 |  | SubscriptionOut |
| `PATCH` | `/fundings/{funding_id}/subscriptions/me` | 청약 수량·리워드 변경 (감액은 마감 1시간 전까지) | 회원 | SubscriptionPatch | SubscriptionOut |
| `DELETE` | `/fundings/{funding_id}/subscriptions/me` | 청약 취소 (마감 1시간 전까지) | 회원 |  | SubscriptionOut |

## market — 상장 종목 지정가 상대매매 (STEP 5, 모의)

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/market/securities` | 상장 종목 목록 (마켓 순위) | 공개 |  | SecurityListItem[] |
| `GET` | `/market/securities/{funding_id}` | 종목 상세 (현재가·발행 정보·배당·내 보유) | 선택 |  | SecurityDetailOut |
| `GET` | `/market/securities/{funding_id}/chart` | 일봉 차트 (체결 기준) | 공개 |  | CandleOut[] |
| `GET` | `/market/securities/{funding_id}/order-preview` | 주문 확인 시트 (수수료·총액·주문 가능 여부) | 회원 |  | OrderPreviewOut |
| `GET` | `/market/securities/{funding_id}/orderbook` | 호가 (가격별 잔량) | 공개 |  | OrderBookOut |
| `GET` | `/market/securities/{funding_id}/trades` | 최근 체결 | 공개 |  | TradeOut[] |
| `GET` | `/market/securities/{funding_id}/dividends` | 종목 배당 내역 | 공개 |  | DividendRunOut[] |
| `POST` | `/market/orders` | 지정가 주문 (같은 가격끼리만 체결) | 회원 | OrderIn | OrderOut |
| `DELETE` | `/market/orders/{order_id}` | 주문 취소 | 회원 |  | OrderOut |

## me — 내 증권·청약·배당·알림

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/me` | 내 정보 | 회원 |  | UserOut |
| `PATCH` | `/me` | 프로필 수정 | 회원 | ProfilePatch | UserOut |
| `POST` | `/me/risk-profile` | 투자성향 확인 (청약·매수 전 필수) | 회원 | RiskProfileIn | UserOut |
| `PUT` | `/me/broker-account` | 제휴 증권사 계좌 연결 (모의) | 회원 | BrokerAccountIn | UserOut |
| `GET` | `/me/limits` | 연간 투자 한도 | 회원 |  | LimitsOut |
| `GET` | `/me/dibs` | 찜한 작품 | 회원 |  | WorkOut[] |
| `GET` | `/me/subscriptions` | 청약 내역 (작품명·배정·리워드·배송) | 회원 |  | MySubscriptionOut[] |
| `GET` | `/me/holdings` | 보유 조각·평가손익 | 회원 |  | HoldingOut[] |
| `GET` | `/me/orders` | 주문 내역 | 회원 |  | OrderOut[] |
| `GET` | `/me/dividends` | 정산 리포트 (분기 배당 내역) | 회원 |  | DividendPaymentOut[] |
| `GET` | `/me/notifications` | 알림 | 회원 |  | NotificationOut[] |
| `POST` | `/me/notifications/{notification_id}/read` | 알림 읽음 | 회원 |  | OK |

## studio — 크리에이터 스튜디오(웹): 내 작품·펀딩·리워드 배송·정산

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/studio/works` | 내 작품 (작성 중·심사 중·반려 포함) | 창작자 |  | WorkAdminOut[] |
| `GET` | `/studio/fundings` | 내 펀딩 (심사 중·반려 포함, 달성률) | 창작자 |  | StudioFundingOut[] |
| `GET` | `/studio/fundings/{funding_id}` | 내 펀딩 상세 (모든 상태) | 창작자 |  | FundingDetailOut |
| `GET` | `/studio/fundings/{funding_id}/shipments` | 리워드 배송 대상 | 창작자 |  | ShipmentOut[] |
| `PUT` | `/studio/fundings/{funding_id}/shipments/{subscription_id}` | 송장 입력 | 창작자 | ShipmentIn | ShipmentOut |
| `GET` | `/studio/settlements` | 정산 (펀딩 지급분 + 분기 저작권료) | 창작자 |  | SettlementOut[] |

## admin — 운영: 심사·마감·발행·상장·매출·배당·입출금 (STEP 4·6)

| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |
|---|---|---|---|---|---|
| `GET` | `/admin/works` | 작품 목록 (상태별, 권리 확인 정보 포함) | 운영자 |  | WorkAdminOut[] |
| `GET` | `/admin/works/{work_id}` | 작품 심사 상세 | 운영자 |  | WorkAdminOut |
| `POST` | `/admin/works/{work_id}/review` | 작품 공개 심사 (권리 확인) | 운영자 | ReviewIn | WorkOut |
| `POST` | `/admin/works/{work_id}/hide` | 비공개 처리 (권리 분쟁 등) | 운영자 | ReasonIn | WorkOut |
| `GET` | `/admin/works/{work_id}/review-metrics` | 펀딩 심사 지표 (본인인증 계정만, 조작 의심 신호) | 운영자 |  | ReviewMetricsOut |
| `GET` | `/admin/works/{work_id}/pre-issuance-settlement` | 발행 전 유료 미리보기 정산 (작가 70 / DIBS 30) | 운영자 |  |  |
| `PATCH` | `/admin/episodes/{episode_id}/pricing` | 유료 미리보기 지정 (4화부터, 기본 300원, 공개 21일 후 무료) | 운영자 | EpisodePricingIn | EpisodeOut |
| `GET` | `/admin/fundings` | 펀딩 목록 (전체 상태) | 운영자 |  | FundingOut[] |
| `GET` | `/admin/fundings/{funding_id}` | 펀딩 상세 (모든 상태) | 운영자 |  | FundingDetailOut |
| `POST` | `/admin/fundings/{funding_id}/review` | 펀딩 심사·발행 조건 확정 | 운영자 | FundingReviewIn | FundingDetailOut |
| `POST` | `/admin/fundings/{funding_id}/open` | 모집 시작 (찜한 회원에게 알림) | 운영자 |  | FundingOut |
| `POST` | `/admin/fundings/{funding_id}/close` | 마감 처리 (실패 환불 또는 안분 배정) | 운영자 |  | CloseOut |
| `GET` | `/admin/fundings/{funding_id}/subscriptions` | 청약·배정표 | 운영자 |  | SubscriptionOut[] |
| `POST` | `/admin/fundings/{funding_id}/issuance` | 발행 요청 | 운영자 | IssuanceRequestIn | IssuanceOut |
| `GET` | `/admin/fundings/{funding_id}/issuance` | 발행 진행 현황 | 운영자 |  | IssuanceOut |
| `POST` | `/admin/fundings/{funding_id}/issuance/advance` | 발행 단계 진행 (LISTED 시 보유 증권 반영·작가 지급) | 운영자 | IssuanceAdvanceIn | IssuanceOut |
| `POST` | `/admin/fundings/{funding_id}/issuance/fail` | 발행 실패 (전액 환불·리워드 취소) | 운영자 | ReasonIn | FundingOut |
| `POST` | `/admin/fundings/{funding_id}/suspension` | 거래 정지 / 해제 | 운영자 | SuspendIn | FundingOut |
| `POST` | `/admin/fundings/{funding_id}/discontinue` | 연재 중단 확정 (남은 작가 지급분을 주주에게 분배, 거래 정지) | 운영자 | ReasonIn | DiscontinueOut |
| `POST` | `/admin/fundings/{funding_id}/complete` | 연재 완결 확정 (종료 규칙 3년 시작) | 운영자 |  | FundingOut |
| `POST` | `/admin/fundings/{funding_id}/terminate` | 권리 종료 (완결 후 3년 또는 저매출 2분기 연속, 원금 상환 없음) | 운영자 |  | FundingOut |
| `GET` | `/admin/fundings/{funding_id}/payouts` | 작가 지급 일정 | 운영자 |  | PayoutOut[] |
| `POST` | `/admin/fundings/{funding_id}/payouts/{seq}/pay` | 마일스톤 지급 실행 | 운영자 |  | PayoutOut |
| `POST` | `/admin/revenues` | 매출 입력 (광고·굿즈 등) | 운영자 | RevenueIn | RevenueOut |
| `POST` | `/admin/fundings/{funding_id}/revenues/aggregate` | 유료 회차 코인 매출 자동 집계 | 운영자 | PeriodIn | RevenueOut |
| `GET` | `/admin/fundings/{funding_id}/revenues` | 매출 내역 | 운영자 |  | RevenueOut[] |
| `POST` | `/admin/fundings/{funding_id}/dividends` | 분기 배당 계산 (기준일 보유 수량 스냅샷) | 운영자 | PeriodIn | DividendRunOut |
| `POST` | `/admin/dividends/{run_id}/pay` | 배당 지급 (원천징수 후 예치금 입금) | 운영자 |  | DividendRunOut |
| `GET` | `/admin/reports` | 신고된 글 | 운영자 |  | ReportedPost[] |
| `POST` | `/admin/posts/{post_id}/visibility` | 글 숨김·복구 | 운영자 | HideIn | ReportedPost |
| `POST` | `/admin/notices` | 공지·종목 공시 등록 | 운영자 | NoticeIn | NoticeOut |
| `GET` | `/admin/withdrawals` | 출금 요청 목록 | 운영자 |  | WithdrawalOut[] |
| `POST` | `/admin/withdrawals/{req_id}/decision` | 출금 승인·거절 | 운영자 | ReviewIn | WithdrawalOut |
| `POST` | `/admin/jobs/expire-orders` | 자정: 전일 미체결 주문 자동 취소 | 운영자 |  | JobOut |
| `POST` | `/admin/jobs/roll-reference-prices` | 04:00 점검: 기준가 = 직전 체결가 | 운영자 |  | JobOut |
| `GET` | `/admin/events/export` | 이벤트 원천 데이터 추출 (데이터 분석용) | 운영자 |  | EventExportItem[] |
| `GET` | `/admin/ledger/trial-balance` | 시산표 (계정 종류별 합계, 총합 0) | 운영자 |  | TrialBalanceLine[] |

## 에러 코드

| code | 기본 메시지 |
|---|---|
| `ALREADY_COMPLETED` | 이미 완결 처리된 작품이에요 |
| `ALREADY_DISCONTINUED` | 이미 연재 중단 처리된 종목이에요 |
| `ALREADY_REPORTED` | 이미 신고한 글이에요 |
| `ALREADY_SUBSCRIBED` | 이미 청약했어요. 수량 변경을 이용해 주세요 |
| `ANNUAL_LIMIT_EXCEEDED` | 연간 투자 한도({annual:,}원)를 넘어요 |
| `ANON_ID_REQUIRED` | 비로그인 이벤트에는 anon_id 가 필요해요 |
| `BEFORE_PAY_DATE` | 지급일({run.pay_date}) 전이에요 |
| `COIN_TO_DEPOSIT_FORBIDDEN` | 코인은 예치금으로 바꿀 수 없어요 |
| `CREATOR_NOT_FOUND` | 작가를 찾을 수 없어요 |
| `CREATOR_ONLY` | 작가 게시판 글은 작가만 쓸 수 있어요. 답글로 참여해 주세요 |
| `DEV_LOGIN_DISABLED` | 운영 환경에서는 사용할 수 없어요 |
| `DIVIDEND_EXISTS` | 이미 계산한 분기예요 |
| `DIVIDEND_NOT_FOUND` | 배당 내역을 찾을 수 없어요 |
| `DIVIDEND_PAID` | 이미 지급한 배당이에요 |
| `EMPTY_JOURNAL` | 금액이 0인 분개는 기록하지 않아요 |
| `EPISODE_FREE` | 무료 회차예요 |
| `EPISODE_NOT_FOUND` | 회차를 찾을 수 없어요 |
| `EPISODE_NO_EXISTS` | 같은 회차 번호가 있어요 |
| `EPISODE_REQUIRED` | 댓글을 달 회차를 지정해 주세요 |
| `EVIDENCE_REQUIRED` | 외부 플랫폼 정산서(증빙)를 첨부해 주세요 |
| `EXCLUSIVE_PERIOD` | 선공개 독점 기간에는 외부 연재 수익을 넣을 수 없어요 |
| `FORBIDDEN_ROLE` | 권한이 없어요 |
| `FUNDING_ALREADY_ACTIVE` | 이 작품은 이미 진행 중인 펀딩이 있어요 |
| `FUNDING_GATE_NOT_MET` | 파일럿 4주 열람자가 {g['gate_threshold']:,}명 이상이어야 펀딩을 열 수 있어요  |
| `FUNDING_NOT_CLOSED_YET` | 아직 마감 시각이 아니에요 |
| `FUNDING_NOT_FOUND` | 펀딩을 찾을 수 없어요 |
| `FUNDING_NOT_IN_PERIOD` | 모집 기간이 아니에요 |
| `HOLDERS_ONLY` | 이 작품 조각을 가진 주주만 볼 수 있어요 |
| `IMAGE_REQUIRED` | 팬아트 이미지를 올려 주세요 |
| `INSUFFICIENT_BALANCE` | 매입가 {price:,}원이 예치금보다 많아요 |
| `INSUFFICIENT_UNITS` | 매도 가능 수량이 부족해요 |
| `INVALID_AMOUNT` | 1원 이상 {MAX_CHARGE:,}원 이하로 입력해 주세요 |
| `INVALID_ANSWERS` | 각 문항은 1~4점이에요 |
| `INVALID_BLOCK` | 차단할 수 없는 사용자예요 |
| `INVALID_FUNDING_STATUS` | 현재 상태({f.status})에서는 할 수 없어요 |
| `INVALID_ISSUANCE_STEP` | {iss.step} 다음 단계가 아니에요 |
| `INVALID_ORDER` | 가격과 수량은 1 이상이어야 해요 |
| `INVALID_PAYOUT_SCHEDULE` | 작가 지급 비율 합계는 100%여야 해요 |
| `INVALID_PERIOD` | 기간은 '2027Q1' 형식이에요 |
| `INVALID_REVENUE` | 매출과 공제액을 확인해 주세요 |
| `INVALID_TERMS` | 모금액 배분율 합계는 100%여야 해요 |
| `INVALID_TOKEN` | 로그인이 필요해요 |
| `INVALID_UNITS` | 1조각 이상 청약해 주세요 |
| `INVALID_WORK_STATUS` | 심사 대기 상태가 아니에요 |
| `ISSUANCE_INFO_REQUIRED` | 증권 식별번호와 신탁·수탁 기관을 입력해 주세요 |
| `ISSUANCE_NOT_FOUND` | 발행 요청 내역이 없어요 |
| `KYC_REQUIRED` | 본인인증 후 청약할 수 있어요 |
| `LISTED_AFTER_RECORD_DATE` | 기준일 이후 상장된 종목이에요 |
| `LIVE_DISABLED` | 실거래는 인가 후 열려요. 지금은 모의투자만 가능해요 |
| `MARKET_MAINTENANCE` | {settings.maintenance_start}~{settings.maintenance_end} 점검 중이에요 |
| `MAX_UNITS_EXCEEDED` | 1인 최대 {cap}조각까지 청약할 수 있어요 |
| `MOCK_DEPOSIT_TO_COIN` | 모의 예치금은 코인으로 바꿀 수 없어요 |
| `NESTED_REPLY` | 답글에는 답글을 달 수 없어요 |
| `NOTICE_NOT_FOUND` | 공지를 찾을 수 없어요 |
| `NOTIFICATION_NOT_FOUND` | 알림을 찾을 수 없어요 |
| `NOT_AUTHOR` | 내가 쓴 글만 지울 수 있어요 |
| `NOT_LISTED` | 상장 후에 확인할 수 있어요 |
| `NOT_TRADABLE` | 거래할 수 없는 종목이에요 (미상장 또는 거래 정지) |
| `NOT_WORK_OWNER` | 내 작품만 관리할 수 있어요 |
| `NO_DIVIDEND_HISTORY` | 배당 이력이 있어야 매입가를 정할 수 있어요 |
| `NO_EPISODES` | 회차를 1개 이상 등록해 주세요 |
| `NO_HOLDERS` | 기준일 보유자가 없어요 |
| `ORDER_NOT_FOUND` | 주문을 찾을 수 없어요 |
| `ORDER_NOT_OPEN` | 이미 체결되었거나 취소된 주문이에요 |
| `PAYMENT_REQUIRED` | 이어서 보려면 {e.price_coin}코인이 필요해요 |
| `PAYOUT_ALREADY_DONE` | 이미 처리된 지급이에요 |
| `PAYOUT_NOT_FOUND` | 지급 일정을 찾을 수 없어요 |
| `PERIOD_CLOSED` | 이미 배당을 계산한 분기예요 |
| `PERIOD_NOT_ENDED` | {period}이 끝난 뒤({record_date} 이후)에 계산할 수 있어요 |
| `PILOT_FREE` | 파일럿 {settings.pilot_free_episodes}화까지는 무료예요 |
| `POLICY_NOT_FOUND` | 문서를 찾을 수 없어요 |
| `POST_NOT_FOUND` | 글을 찾을 수 없어요 |
| `PRICE_OUT_OF_BAND` | 주문 가능 가격은 {lo:,}~{hi:,}원이에요 |
| `RIGHTS_NOT_DECLARED` | 작품 공개 권한을 확인해 주세요 |
| `RISK_NOTICE_REQUIRED` | 투자 위험 고지에 동의해 주세요 |
| `RISK_PROFILE_REQUIRED` | 투자성향 확인 후 청약할 수 있어요 |
| `SECURITY_LIMIT_EXCEEDED` | 종목당 투자 한도({per_security:,}원)를 넘어요 |
| `SECURITY_NOT_FOUND` | 상장 종목이 아니에요 |
| `SELF_INVEST_FORBIDDEN` | 창작자는 자기 작품에 청약할 수 없어요 |
| `SELF_REPORT` | 내 글은 신고할 수 없어요 |
| `SELF_TRADE_FORBIDDEN` | 창작자는 자기 작품 조각을 거래할 수 없어요 |
| `SHIPMENT_NOT_FOUND` | 배송 대상이 아니에요 |
| `SHIPPING_NOT_REQUIRED` | 배송이 필요 없는 리워드예요 |
| `SHIPPING_REQUIRED` | 배송지를 입력해 주세요 |
| `SHORT_REQUIRED` | 댓글을 달 숏츠를 지정해 주세요 |
| `SUBSCRIPTION_LOCKED` | 마감 {settings.subscription_lock_minutes}분 전부터는 감액·취소할 수 없어요 |
| `SUBSCRIPTION_NOT_FOUND` | 청약 내역이 없어요 |
| `TARGET_OVER_CAP` | 목표 금액은 {g['target_cap']:,}원을 넘을 수 없어요 |
| `TERMINATION_NOTICE_REQUIRED` | 만기 없음·종료 규칙 고지에 동의해 주세요 |
| `TERMINATION_NOT_DUE` | 종료 조건(완결 후 3년 또는 저매출 2분기 연속)을 충족하지 않았어요 |
| `TIER_MIN_UNITS` | 이 리워드는 {tier.min_units}조각 이상 청약해야 받을 수 있어요 |
| `TIER_NOT_FOUND` | 리워드를 찾을 수 없어요 |
| `TIER_SOLD_OUT` | 한정 수량이 모두 찼어요 |
| `TOO_MANY_TIERS` | 리워드 티어는 최대 {MAX_REWARD_TIERS}개예요 |
| `UNAUTHORIZED` | 로그인이 필요해요 |
| `VALIDATION_ERROR` | 입력값을 확인해 주세요 (422, `fields` 에 항목별 사유) |
| `WITHDRAWAL_DECIDED` | 이미 처리된 요청이에요 |
| `WITHDRAWAL_NOT_FOUND` | 출금 요청을 찾을 수 없어요 |
| `WORK_NOT_FOUND` | 작품을 찾을 수 없어요 |
| `WORK_NOT_PUBLISHED` | 공개된 작품만 펀딩을 신청할 수 있어요 |
