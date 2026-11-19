"""코드에서 문서를 생성한다 (코드가 바뀌면 다시 실행).

    python -m scripts.export_docs

- docs/openapi.json : OpenAPI 3 스펙 (Swagger/Postman 가져오기용)
- docs/API_SPEC.md  : 엔드포인트 표 + 에러 코드 목록
- docs/ERD.md       : SQLAlchemy 모델에서 만든 Mermaid ERD + 상태 다이어그램
"""
import json
import os
import re
from pathlib import Path

os.environ.setdefault("DIBS_DATABASE_URL", "sqlite://")
os.environ.setdefault("DIBS_ENV", "test")

from app.core.db import Base  # noqa: E402
import app.models  # noqa: E402,F401
from app.main import app as fastapi_app  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

PUBLIC = {
    ("GET", "/health"), ("POST", "/auth/dev-login"), ("GET", "/works"), ("GET", "/works/{work_id}"),
    ("GET", "/works/{work_id}/episodes"), ("GET", "/episodes/{episode_id}"), ("GET", "/shorts/feed"),
    ("POST", "/events"), ("GET", "/fundings"), ("GET", "/fundings/{funding_id}"),
    ("GET", "/market/securities"), ("GET", "/market/securities/{funding_id}/orderbook"),
    ("GET", "/market/securities/{funding_id}/trades"), ("GET", "/market/securities/{funding_id}/dividends"),
    ("GET", "/market/securities/{funding_id}/chart"), ("GET", "/works/{work_id}/shorts"),
    ("GET", "/fundings/{funding_id}/breakeven"), ("GET", "/fundings/{funding_id}/buyback-quote"),
    ("GET", "/works/{work_id}/funding-gate"), ("GET", "/creators/{user_id}"), ("GET", "/notices"),
    ("GET", "/notices/{notice_id}"), ("GET", "/policies"), ("GET", "/policies/{key}"),
}
OPTIONAL_AUTH = {("GET", "/works/{work_id}"), ("GET", "/works/{work_id}/episodes"), ("GET", "/episodes/{episode_id}"),
                 ("POST", "/events"), ("GET", "/market/securities/{funding_id}"), ("GET", "/works/{work_id}/shorts"),
                 ("GET", "/works/{work_id}/posts"), ("GET", "/posts/{post_id}/replies")}
CREATOR = {
    ("POST", "/works"), ("PATCH", "/works/{work_id}"), ("POST", "/works/{work_id}/submit"),
    ("POST", "/works/{work_id}/episodes"), ("POST", "/works/{work_id}/shorts"), ("GET", "/works/{work_id}/metrics"),
    ("POST", "/works/{work_id}/fundings"), ("POST", "/fundings/{funding_id}/buyback"),
}
TAG_TITLES = {t["name"]: t["description"] for t in fastapi_app.openapi_tags}


def auth_of(method: str, path: str) -> str:
    if path.startswith("/admin"):
        return "운영자"
    if (method, path) in CREATOR or path.startswith("/studio"):
        return "창작자"
    if (method, path) in OPTIONAL_AUTH:
        return "선택"
    if (method, path) in PUBLIC:
        return "공개"
    return "회원"


def schema_name(ref: dict | None) -> str:
    if not ref:
        return ""
    if "$ref" in ref:
        return ref["$ref"].split("/")[-1]
    if ref.get("type") == "array" and "$ref" in ref.get("items", {}):
        return ref["items"]["$ref"].split("/")[-1] + "[]"
    return ref.get("type", "")


def api_spec(spec: dict) -> str:
    out = [
        "# DIBS API 명세 (v0.1 초안)",
        "",
        "> 이 문서는 `python -m scripts.export_docs` 로 코드에서 생성됩니다. 직접 고치지 말고 코드를 고친 뒤 다시 생성하세요.",
        "> 요청·응답 필드 상세는 서버 실행 후 `/docs`(Swagger UI) 또는 `docs/openapi.json` 을 보세요.",
        "",
        "## 공통 규칙",
        "",
        "| 항목 | 규칙 |",
        "|---|---|",
        "| 인증 | `Authorization: Bearer <token>` (개발용 `POST /auth/dev-login` 으로 발급) |",
        "| 금액 | 원 단위 정수 (소수 없음) |",
        "| 비율 | bps 정수 (10000 = 100%, 3000 = 30%) |",
        "| 시각 | KST 기준 ISO 8601 (`2027-03-02T10:00:00`) |",
        "| 모드 | 투자 기능은 `MOCK`(모의) 기본. 응답의 `mode` 로 화면에 '모의' 배지 표시 |",
        "| 에러 | `{\"error\": {\"code\": \"SUBSCRIPTION_LOCKED\", \"message\": \"...\"}}` — 프런트는 `code` 로 분기 |",
        "| 목록 | `limit`, `offset` 쿼리 (기본 20~50) |",
        "",
        "권한: **공개**(토큰 불필요) · **선택**(로그인 시 개인화) · **회원** · **창작자** · **운영자**",
        "",
    ]
    by_tag: dict[str, list] = {}
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            by_tag.setdefault(op["tags"][0], []).append((method.upper(), path, op))
    for tag in [t["name"] for t in fastapi_app.openapi_tags]:
        rows = by_tag.get(tag, [])
        out += [f"## {tag} — {TAG_TITLES[tag]}", "", "| 메서드 | 경로 | 설명 | 권한 | 요청 | 응답 |", "|---|---|---|---|---|---|"]
        for method, path, op in rows:
            body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
            ok = next((v for k, v in op["responses"].items() if k.startswith("2")), {})
            resp = ok.get("content", {}).get("application/json", {}).get("schema")
            out.append(f"| `{method}` | `{path}` | {op.get('summary', '')} | {auth_of(method, path)} | "
                       f"{schema_name(body)} | {schema_name(resp)} |")
        out.append("")

    codes: dict[str, str] = {}
    pat = re.compile(r'(?:DomainError|NotFound|Forbidden|Conflict)\(\s*"([A-Z_]+)",\s*f?"([^"]+)"')
    for py in sorted((ROOT / "app").rglob("*.py")):
        for code, msg in pat.findall(py.read_text(encoding="utf-8")):
            codes.setdefault(code, msg)
    codes.setdefault("INSUFFICIENT_BALANCE", "예치금이 부족해요 / 코인이 부족해요")
    codes.setdefault("VALIDATION_ERROR", "입력값을 확인해 주세요 (422, `fields` 에 항목별 사유)")
    codes.setdefault("UNAUTHORIZED", "로그인이 필요해요 (401)")
    out += ["## 에러 코드", "", "| code | 기본 메시지 |", "|---|---|"]
    out += [f"| `{c}` | {m} |" for c, m in sorted(codes.items())]
    out.append("")
    return "\n".join(out)


def erd() -> str:
    lines = ["erDiagram"]
    rels = []
    for table in sorted(Base.metadata.sorted_tables, key=lambda t: t.name):
        lines.append(f"    {table.name} {{")
        for col in table.columns:
            typ = type(col.type).__name__.lower()
            typ = {"enum": "enum", "biginteger": "bigint", "datetime": "datetime"}.get(typ, typ)
            key = "PK" if col.primary_key else ("FK" if col.foreign_keys else "")
            lines.append(f"        {typ} {col.name} {key}".rstrip())
            for fk in col.foreign_keys:
                rels.append(f"    {fk.column.table.name} ||--o{{ {table.name} : \"{col.name}\"")
        lines.append("    }")
    lines += sorted(set(rels))
    mermaid = "\n".join(lines)

    return f"""# DIBS ERD

> `python -m scripts.export_docs` 로 모델 코드에서 생성됩니다.

## 테이블 묶음

| 영역 | 테이블 | 비고 |
|---|---|---|
| 회원 | users, notifications | 역할: READER / CREATOR / ADMIN |
| 콘텐츠 | works, episodes, shorts, dibs, episode_unlocks | 발행 전 전 회차 무료, 상장 후 운영자가 유료 지정 |
| 이용 데이터 | content_events | 데이터 분석 팀과 공유하는 원천 로그 (docs/EVENTS.md) |
| 원장 | accounts, journals, postings, withdrawal_requests | 복식부기, append-only. 코인·예치금 계정 분리 |
| 펀딩 | fundings, reward_tiers, subscriptions, payout_schedules | 펀딩 = 조각 청약, 상장 후 fundings 가 종목 역할 |
| 발행 | issuances | 제휴 증권사 발행 단계 |
| 마켓 | holdings, orders, trades | 지정가 상대매매 (모의) |
| 배당 | revenue_records, dividend_runs, dividend_payments | 분기 배당 (나눠지는 재원 + 전액 주주 재원) |
| 커뮤니티 | posts, post_reports, user_blocks, notices | 댓글·게시판·팬아트·주주 게시판·신고·공지 |

## 상태 흐름

### 펀딩 (fundings.status)

```mermaid
stateDiagram-v2
    [*] --> IN_REVIEW: 창작자 신청
    IN_REVIEW --> REJECTED: 심사 반려
    IN_REVIEW --> APPROVED: 조건 확정
    APPROVED --> OPEN: 모집 시작
    OPEN --> FAILED: 마감·목표 미달 (전액 해제)
    OPEN --> ALLOCATED: 마감·안분 배정
    ALLOCATED --> ISSUING: 발행 요청
    ALLOCATED --> ISSUE_FAILED: 발행 무산
    ISSUING --> ISSUE_FAILED: 발행 실패 (전액 환불)
    ISSUING --> LISTED: 상장 (보유 증권 반영·작가 지급)
    LISTED --> SUSPENDED: 거래 정지
    SUSPENDED --> LISTED: 정지 해제
    LISTED --> SUSPENDED: 연재 중단 확정 (미지급분 주주 분배)
    LISTED --> TERMINATED: 권리 종료 (완결 후 3년 / 저매출 2분기 연속, 원금 상환 없음)
    SUSPENDED --> TERMINATED: 권리 종료
    LISTED --> TERMINATED: 작가 매입 (최근 4분기 분배금 × 3)
```

### 청약 (subscriptions.status)

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: 청약 (예치금 묶임)
    ACTIVE --> CANCELLED: 취소 (마감 1시간 전까지)
    CANCELLED --> ACTIVE: 재청약
    ACTIVE --> ALLOCATED: 1조각 이상 배정
    ACTIVE --> REFUNDED: 펀딩 실패 / 0조각 배정
    ALLOCATED --> REFUNDED: 발행 실패
```

### 주문 (orders.status)

```mermaid
stateDiagram-v2
    [*] --> OPEN
    OPEN --> PARTIAL: 일부 체결
    OPEN --> FILLED
    PARTIAL --> FILLED
    OPEN --> CANCELLED: 회원 취소 / 거래 정지
    PARTIAL --> CANCELLED
    OPEN --> EXPIRED: 자정 자동 취소
    PARTIAL --> EXPIRED
```

## 돈의 흐름 (원장 분개)

| 이벤트 | 출금 계정 (−) | 입금 계정 (+) |
|---|---|---|
| 코인 충전 | SYS_PG | COIN |
| 유료 미리보기 구매 (4화부터, 공개 21일 후 무료) | COIN | SYS_COIN_REVENUE |
| 예치금 입금 | SYS_BANK | DEPOSIT |
| 청약 | DEPOSIT | DEPOSIT_LOCKED |
| 마감·배정 | DEPOSIT_LOCKED | SYS_FUNDING_ESCROW (배정분) + DEPOSIT (초과분 환불) |
| 펀딩 실패 | DEPOSIT_LOCKED | DEPOSIT |
| 상장 정산 | SYS_FUNDING_ESCROW | SYS_CREATOR_PAYABLE 80% · SYS_ISSUANCE_COST 12% · SYS_PLATFORM_REVENUE 8% |
| 작가 지급 (상장 40% · 마일스톤 30% · 30%) | SYS_CREATOR_PAYABLE | 작가 DEPOSIT |
| 연재 중단 분배 | SYS_CREATOR_PAYABLE (미지급분) | 주주 DEPOSIT (보유 비율) |
| 매수 주문 | DEPOSIT | DEPOSIT_LOCKED (금액 + 수수료) |
| 체결 | 매수자 DEPOSIT_LOCKED | 매도자 DEPOSIT (− 매도 수수료) · SYS_BROKER_FEE (매수·매도 수수료 0.015%, 거래소·증권사 몫) |
| 배당 지급 | SYS_ROYALTY_POOL | 주주 DEPOSIT (세후) · SYS_TAX_WITHHOLDING · 작가 DEPOSIT · SYS_PLATFORM_REVENUE (회수 전 45·30·25 → 회수 후 35·40·25) |
| 작가 매입 | 작가 DEPOSIT | 주주 DEPOSIT (보유 비율) |

코인 → 예치금 방향의 분개는 원장 계층에서 거부됩니다 (`COIN_TO_DEPOSIT_FORBIDDEN`).

## 전체 ERD

```mermaid
{mermaid}
```
"""


def main() -> None:
    DOCS.mkdir(exist_ok=True)
    spec = fastapi_app.openapi()
    (DOCS / "openapi.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    (DOCS / "API_SPEC.md").write_text(api_spec(spec), encoding="utf-8")
    (DOCS / "ERD.md").write_text(erd(), encoding="utf-8")
    n = sum(len(v) for v in spec["paths"].values())
    print(f"openapi.json, API_SPEC.md ({n} endpoints), ERD.md ({len(Base.metadata.tables)} tables) 생성")


if __name__ == "__main__":
    main()
