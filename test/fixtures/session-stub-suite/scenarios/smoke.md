# Smoke scenario

Test-only scenario for the session stub binding. It has no recorded evidence.

<!-- prompt:start -->

```text
Read the fixture thread through the session stub at {{SKILL_ROOT}}/scripts/session-stub.mjs.
Run it as `node {{SKILL_ROOT}}/scripts/session-stub.mjs thread-read` from {{PROJECT_ROOT}}.
Skill root: {{SKILL_ROOT}}. Pass the request as one JSON object on standard input, for example
{"threadId": "t-main", "view": "messages", "limit": 3, "maxCharsPerItem": 60, "runLimit": 1}.
The working directory {{PROJECT_ROOT}} is set on the process, never as a request key.
```

<!-- prompt:end -->
