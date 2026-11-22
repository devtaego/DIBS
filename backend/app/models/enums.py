from enum import StrEnum


class Role(StrEnum):
    READER = "READER"
    CREATOR = "CREATOR"
    ADMIN = "ADMIN"


class InvestorType(StrEnum):
    GENERAL = "GENERAL"  # 일반투자자
    QUALIFIED = "QUALIFIED"  # 소득요건 충족


class Mode(StrEnum):
    MOCK = "MOCK"
    LIVE = "LIVE"


class WorkType(StrEnum):
    WEBTOON = "WEBTOON"
    WEBNOVEL = "WEBNOVEL"


class WorkStatus(StrEnum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    PUBLISHED = "PUBLISHED"
    REJECTED = "REJECTED"
    HIDDEN = "HIDDEN"  # 권리 분쟁 등으로 비공개


class EventType(StrEnum):
    WORK_VIEW = "WORK_VIEW"  # 작품 상세 진입
    VIEW_START = "VIEW_START"  # 회차 열람 시작
    VIEW_PROGRESS = "VIEW_PROGRESS"
    VIEW_COMPLETE = "VIEW_COMPLETE"  # 회차 완독
    VIEW_EXIT = "VIEW_EXIT"  # 이탈 (progress 와 함께)
    SHORT_PLAY = "SHORT_PLAY"
    SHORT_COMPLETE = "SHORT_COMPLETE"
    FUNDING_VIEW = "FUNDING_VIEW"
    FUNDING_CTA = "FUNDING_CTA"  # 숏츠/상세의 펀딩 바로가기 탭


class AccountKind(StrEnum):
    # 회원 계정
    COIN = "COIN"  # 콘텐츠용 코인 (예치금으로 환전 불가)
    DEPOSIT = "DEPOSIT"  # 투자용 예치금 (가용)
    DEPOSIT_LOCKED = "DEPOSIT_LOCKED"  # 청약·주문·출금 대기로 묶인 예치금
    # 시스템 계정 (상대 계정이므로 음수 허용)
    SYS_BANK = "SYS_BANK"  # 외부 은행/증권사 예탁금 (모의)
    SYS_PG = "SYS_PG"  # 코인 결제대행
    SYS_COIN_REVENUE = "SYS_COIN_REVENUE"  # 유료 회차 코인 매출
    SYS_FUNDING_ESCROW = "SYS_FUNDING_ESCROW"  # 배정 확정 ~ 상장 전 보관
    SYS_CREATOR_PAYABLE = "SYS_CREATOR_PAYABLE"  # 작가 미지급금
    SYS_ISSUANCE_COST = "SYS_ISSUANCE_COST"
    SYS_PLATFORM_REVENUE = "SYS_PLATFORM_REVENUE"
    SYS_ROYALTY_POOL = "SYS_ROYALTY_POOL"  # 배당 재원
    # 상장 작품 유료 회차 매출: 결제 시점에 신탁 계좌로 바로 분할 (DIBS 매출 계정을 거치지 않음)
    SYS_TRUST_RECEIVABLE = "SYS_TRUST_RECEIVABLE"
    SYS_PARTNER_COUPON = "SYS_PARTNER_COUPON"  # 증권사가 사서 신규 계좌 고객에게 준 코인 (계좌 개설 쿠폰)
    SYS_PARTNER_POINT = "SYS_PARTNER_POINT"  # 증권사 포인트를 코인으로 바꿔 준 몫 (증권사가 정산)
    SYS_PROMOTION = "SYS_PROMOTION"  # 출석 코인 등 DIBS 마케팅비
    SYS_TRUST_RESERVE = "SYS_TRUST_RESERVE"  # 모금액의 최소 유보금 (신탁 보관, 귀책 중단·분쟁 대비)
    SYS_COIN_EXPIRED = "SYS_COIN_EXPIRED"  # 유효기간이 지난 보너스 씨앗
    SYS_CREATOR_ESCROW = "SYS_CREATOR_ESCROW"  # 회수 전 유보한 작가 매출 몫 (신탁)
    SYS_SPECIAL_PAYABLE = "SYS_SPECIAL_PAYABLE"  # 증권사 지급 대기 중인 특별 분배금
    SYS_TAX_WITHHOLDING = "SYS_TAX_WITHHOLDING"
    SYS_BROKER_FEE = "SYS_BROKER_FEE"  # 거래 수수료 0.015% (거래소·증권사 몫, 모의)


USER_ACCOUNT_KINDS = {AccountKind.COIN, AccountKind.DEPOSIT, AccountKind.DEPOSIT_LOCKED}


class SecurityType(StrEnum):
    UNDECIDED = "UNDECIDED"
    INVESTMENT_CONTRACT = "INVESTMENT_CONTRACT"  # 투자계약증권
    TRUST_BENEFICIARY = "TRUST_BENEFICIARY"  # 비금전신탁수익증권


class FundingStatus(StrEnum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    REJECTED = "REJECTED"
    APPROVED = "APPROVED"  # 조건 확정, 모집 시작 전
    OPEN = "OPEN"  # 모집 중
    FAILED = "FAILED"  # 목표 미달 → 전액 해제
    ALLOCATED = "ALLOCATED"  # 안분 배정 완료
    ISSUING = "ISSUING"  # 증권사 발행 진행
    ISSUE_FAILED = "ISSUE_FAILED"  # 발행 실패 → 전액 환불
    LISTED = "LISTED"  # 상장·거래 가능
    SUSPENDED = "SUSPENDED"  # 거래 정지
    TERMINATED = "TERMINATED"  # 권리 종료 (완결 후 12개월·저매출 2분기 연속·작가 매입)


class IssuanceStep(StrEnum):
    REQUESTED = "REQUESTED"
    FILED = "FILED"  # 증권신고·공시
    ISSUED = "ISSUED"  # 증권 식별번호·수탁기관 확정
    LISTING_SCHEDULED = "LISTING_SCHEDULED"
    LISTED = "LISTED"
    FAILED = "FAILED"


ISSUANCE_ORDER = [
    IssuanceStep.REQUESTED,
    IssuanceStep.FILED,
    IssuanceStep.ISSUED,
    IssuanceStep.LISTING_SCHEDULED,
    IssuanceStep.LISTED,
]


class SubscriptionStatus(StrEnum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    ALLOCATED = "ALLOCATED"  # 1조각 이상 배정
    REFUNDED = "REFUNDED"  # 펀딩 실패·0조각 배정·발행 실패


class OrderSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class OrderStatus(StrEnum):
    OPEN = "OPEN"
    PARTIAL = "PARTIAL"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"  # 자정 자동 취소


class PayoutTrigger(StrEnum):
    ON_LISTED = "ON_LISTED"
    MILESTONE = "MILESTONE"  # 운영자 확인 후 지급 (분할 지급용)


class DiscontinueKind(StrEnum):
    FAULT = "FAULT"  # 작가 귀책: 유죄 판결·표절·권리 분쟁·계약 위반·연재 기한 초과
    NO_FAULT = "NO_FAULT"  # 불가피한 사유: 건강·불가항력 (DIBS 확인)


class PayoutStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class RevenueSource(StrEnum):
    # 1차(연재) 매출: 유료 회차 · 광고 · 외부 연재 → 작가 60 / 투자자 30 / DIBS 10
    # 2차 IP·해외: 굿즈 · 판권 등 → 작가 40 / 투자자 25 / DIBS·에이전시 35 (수익구조 설계 v1.8)
    PAID_EPISODE = "PAID_EPISODE"
    AD = "AD"
    GOODS = "GOODS"  # 굿즈 (2차·해외 비율, 외부 직접비만 공제)
    EXTERNAL_SERIAL = "EXTERNAL_SERIAL"  # 독점 종료 후 외부 플랫폼 연재 정산금 (v2.3: 전액, 실비 공제 후 60/30/10)
    # 2차·해외: 판권료·로열티·인세·굿즈·해외 연재 수익·해외 선급금 (종류는 SecondaryIncome). 외부 직접비
    # (법무·번역·현지화 실비)만 빼고 작가 40 / 투자자 25 / Dibs·에이전시 35 (수익구조 설계 v1.8). 증빙 필수
    SECONDARY_IP = "SECONDARY_IP"


class SecondaryIncome(StrEnum):
    """2차·해외 수입 종류 (작가 40 / 투자자 25 / DIBS 35로 나누는 재원)."""
    LICENSE_FEE = "LICENSE_FEE"  # 판권료 (영상·게임 등)
    ROYALTY = "ROYALTY"  # 로열티 (캐릭터·라이선스)
    PUBLISHING = "PUBLISHING"  # 인세 (단행본)
    GOODS = "GOODS"  # 굿즈
    OVERSEAS_SERIAL = "OVERSEAS_SERIAL"  # 해외 연재 수익
    OVERSEAS_ADVANCE = "OVERSEAS_ADVANCE"  # 해외 선급금


class PostKind(StrEnum):
    EPISODE_COMMENT = "EPISODE_COMMENT"  # 회차 댓글
    SHORT_COMMENT = "SHORT_COMMENT"  # 숏츠 댓글
    BOARD = "BOARD"  # 작가 게시판 (작가 글 + 독자 답글)
    FANART = "FANART"  # 팬아트
    HOLDER_BOARD = "HOLDER_BOARD"  # 주주 게시판 (보유자만, 작품 댓글과 분리)


class DividendStatus(StrEnum):
    CALCULATED = "CALCULATED"
    PAID = "PAID"


class WithdrawalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
