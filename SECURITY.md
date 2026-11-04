# Security Policy

## Supported versions

Only the latest commit on the `main` branch (and the deployment built from it)
receives security fixes.

| Version        | Supported |
| -------------- | --------- |
| `main` (latest) | ✅        |
| Anything older | ❌        |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Instead, report them privately using GitHub's
[private vulnerability reporting](https://github.com/tranjcs/tic-tac-toe/security/advisories/new)
("Security" tab → "Report a vulnerability").

Please include as much of the following as you can:

- The type of issue (e.g. XSS, denial of service, Socket.IO event abuse, dependency vulnerability)
- The affected file(s), route(s), or Socket.IO event(s)
- Step-by-step instructions to reproduce the issue
- A proof of concept or exploit code, if available
- The impact you believe the issue has

## What to expect

- An acknowledgement of your report within **7 days**.
- An initial assessment, and an estimated timeline for a fix, within **14 days**.
- Credit in the published advisory once the fix is released, unless you ask
  to stay anonymous.

If a report is declined, you'll get an explanation of why.

## Dependencies

Dependency updates are automated with Dependabot (see
[`.github/dependabot.yml`](.github/dependabot.yml)). If you find a vulnerability
in an upstream package, please report it to that project directly as well.
