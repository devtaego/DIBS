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
    SYS_TAX_WITHHOLDING = "SYS_TAX_WITHHOLDING"
    SYS_FEE_RESERVE = "SYS_FEE_RESERVE"  # 거래 수수료 중 종목 배당 재원 적립분


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
    MATURED = "MATURED"  # 운용 기간 만료 (처리 방식 미정)


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


class PayoutStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class RevenueSource(StrEnum):
    # 순매출을 DIBS / 작가 / 주주로 나누는 재원
    PAID_EPISODE = "PAID_EPISODE"
    AD = "AD"
    GOODS = "GOODS"
    # 전액 주주 몫으로 들어가는 재원 (v3.0)
    EXTERNAL_SERIAL = "EXTERNAL_SERIAL"  # 외부 연재 수익 중 작가 몫 × external_share_bps
    FEE_RESERVE = "FEE_RESERVE"  # 거래 수수료 적립분


HOLDER_ONLY_SOURCES = {RevenueSource.EXTERNAL_SERIAL, RevenueSource.FEE_RESERVE}


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
