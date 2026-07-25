# Security notes

- Telegram `initData` is validated only on the server.
- The browser receives a short-lived signed session token.
- Static responses include a restrictive CSP and permissions policy.
- API bodies are size limited.
- Basic IP and user rate limiting is included.
- Round seeds are generated with `crypto.randomBytes`.
- The SHA-256 commitment is published before the first impact.
- Round reveal is unavailable while the round is active.
- The demonstration wallet is process memory only and resets on restart.

Before production:

- store sessions in Redis;
- store rounds and ledger in PostgreSQL;
- rotate secrets through a managed secrets service;
- restrict CORS to the exact production origin;
- run behind a WAF and DDoS protection;
- add structured audit logs with PII redaction;
- add replay protection and session revocation;
- add monitoring for abnormal impact/cash-out request patterns.
