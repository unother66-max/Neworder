# 뉴오더클럽 운영자 등록

뉴오더클럽 운영관리 접근은 활성 `NewOrderOperator` 레코드 존재 여부로만
판단한다. `ADMIN_EMAILS`, 사용자 tier, 표시 역할은 운영 기능 권한을
부여하지 않는다.

표시 역할:

- `STORE_MANAGER`: 점장
- `ADMIN`: 관리자
- `SUPERADMIN`: 최고관리자

세 역할의 운영 기능 권한은 동일하다.

## 최초 배포

1. 대상 계정으로 PostLabs에 한 번 로그인해 `User` 레코드를 만든다.
2. Vercel 환경변수에 최초 운영자 이메일을 설정한다.

```text
NEW_ORDER_INITIAL_OPERATOR_EMAILS=natalie0@nate.com
NEW_ORDER_INITIAL_OPERATOR_ROLE=SUPERADMIN
```

여러 이메일은 쉼표로 구분한다. 역할은 표시용이며 생략하면
`SUPERADMIN`으로 저장된다.

3. 데이터베이스 마이그레이션을 적용한다.

```bash
npx prisma migrate deploy
```

4. 같은 배포 환경변수를 읽을 수 있는 환경에서 seed를 실행한다.

```bash
npm run neworder:seed-operators
```

seed는 이메일에 해당하는 기존 `User`를 찾아 `NewOrderOperator`를
upsert한다. 이메일만으로 로그인 권한을 우회하지 않는다.

## Legacy data backfill

운영 데이터 조회 API는 읽기 전용이며 백필을 자동 실행하지 않는다.
기존 가격 후보나 기본 거래처를 명시적으로 보정해야 할 때만 아래 명령을
한 번 실행한다.

```bash
npm run neworder:backfill
```

이 명령은 Vercel 요청 처리 중 실행하지 않는다. 외부 fetch나 interactive
transaction을 사용하지 않고 일반 Prisma 작업을 순차적으로 완료한다.

## 이후 운영자 관리

PostLabs 최고관리자는 다음 내부 화면에서 운영자를 등록하고 상태를
변경할 수 있다.

```text
/admin/neworder-operators
```

등록할 이메일은 PostLabs 로그인 이력이 있어 `User`로 존재해야 한다.
운영 접근을 중지하려면 삭제하지 않고 `isActive=false`로 변경한다.

## 미등록 사용자 동작

- 비로그인 사용자: `/login?callbackUrl=/operations/neworder`로 이동
- 로그인했지만 활성 운영자가 아닌 사용자:
  `/operations/neworder-access-denied`로 이동
- API 요청: HTTP 403과
  `활성 NewOrderOperator로 등록된 계정만 운영관리에 접근할 수 있습니다.`
  메시지 반환

## 확인 쿼리

운영 환경 DB에서 이메일 기준으로 확인할 때:

```sql
SELECT
  u.email,
  u.name,
  o.role,
  o."isActive",
  o."createdAt",
  o."updatedAt"
FROM "User" u
LEFT JOIN "NewOrderOperator" o ON o."userId" = u.id
WHERE lower(u.email) = lower('natalie0@nate.com');
```
