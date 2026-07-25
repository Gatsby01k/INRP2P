# Real-money production requirements

The included server is authoritative for demonstration credits, but it intentionally uses in-memory storage. It is not a real-money wallet.

## Required production services

1. **Authentication gateway**
   - validates Telegram `initData`;
   - rejects stale `auth_date`;
   - issues short-lived, revocable sessions;
   - records device and risk signals.

2. **Wallet ledger**
   - PostgreSQL double-entry ledger;
   - immutable journal rows;
   - balance derived from ledger or protected cached balance;
   - idempotency keys on every financial command;
   - no direct balance mutation from the game client.

3. **Round engine**
   - server-generated cryptographic seed;
   - pre-round commitment;
   - certified probability model;
   - monotonic round state machine;
   - Redis or equivalent for low-latency state;
   - PostgreSQL final record and event history.

4. **Atomic cash-out resolver**
   - the server assigns a canonical impact timestamp;
   - cash-out wins only when accepted before the destruction transition;
   - cash-out and destruction use one serializable transaction or one atomic Redis script;
   - client animation never decides the result.

5. **Compliance controls**
   - age and identity verification;
   - jurisdiction and sanctions screening;
   - deposit, loss, wager and session limits;
   - self-exclusion and cool-off periods;
   - reality checks and full transaction history;
   - risk-based source-of-funds review where required.

6. **Certification**
   - independent RNG/game mathematics lab;
   - penetration test;
   - source-code and release checksum control;
   - change-management and incident response.

## Client trust boundaries

Never trust from the browser:

- Telegram user object from `initDataUnsafe`;
- bet balance;
- multiplier;
- impact count;
- cash-out amount;
- round seed;
- timestamp claimed by the client.

The client should render server events and submit intentions only.
