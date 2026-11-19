"""마켓 게이트웨이 인터페이스.

발행·유통 분리 원칙에 따라 실서비스의 거래는 제휴 장외거래소에서 이뤄질 가능성이 크다.
그래서 API 계층은 이 인터페이스만 알고, 구현은 교체할 수 있게 둔다.
- InternalMockExchange : MVP 모의투자용 내부 상대매매 엔진 (현재 구현)
- ExternalExchangeAdapter : 제휴 장외거래소 API 연동 (추후 구현)
"""
from abc import ABC, abstractmethod
from datetime import date

from app.models import Funding, Order, Trade, User
from app.models.enums import OrderSide


class MarketGateway(ABC):
    @abstractmethod
    def place_order(self, user: User, funding: Funding, side: OrderSide, price: int, units: int) -> Order: ...

    @abstractmethod
    def preview_order(self, user: User, funding: Funding, side: OrderSide, price: int, units: int) -> dict:
        """주문 확인 시트: 수수료·총액·주문 가능 여부와 불가 사유 코드."""

    @abstractmethod
    def daily_candles(self, funding: Funding, days: int = 30) -> list[dict]: ...

    @abstractmethod
    def cancel_order(self, user: User, order_id: int) -> Order: ...

    @abstractmethod
    def order_book(self, funding: Funding, depth: int = 10) -> dict: ...

    @abstractmethod
    def recent_trades(self, funding: Funding, limit: int = 50) -> list[Trade]: ...

    @abstractmethod
    def expire_orders(self, today: date) -> int:
        """자정 자동 취소: trade_date < today 인 미체결 주문을 만료 처리."""

    @abstractmethod
    def roll_reference_prices(self) -> int:
        """점검 시간(04:00)에 기준가를 직전 체결가로 갱신 → '전일 종가' 정의."""

    @abstractmethod
    def cancel_all(self, funding: Funding) -> int:
        """거래 정지 시 해당 종목 미체결 주문 일괄 취소."""
