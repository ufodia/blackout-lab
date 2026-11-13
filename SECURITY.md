# Security policy

## Sensitive boundaries

Security-sensitive areas include target URL parsing, local-server request checks, browser-context isolation, input bounds, report escaping, evidence sanitization and dependencies.

Only the current `main` source is maintained at this stage. There is no promised security-response time or long-term support branch.

## Report privately

Use [Report a vulnerability](https://github.com/ufodia/blackout-lab/security/advisories/new). GitHub private vulnerability reporting is enabled for this repository. Do not publish exploit details or private experiment data in an issue.

Provide the affected commit, reproduction steps, impact and a synthetic example through the private route. Share only the evidence needed to reproduce the problem.

## Intended operation

Blackout Lab is a loopback application for a single operator testing an authorized target. Do not expose its backend publicly or disable its Host/Origin and custom-header checks. The tool drives page navigation; it does not certify target code or provide a general-purpose malware sandbox.

See [privacy.md](docs/privacy.md) for what experiment evidence can contain.
