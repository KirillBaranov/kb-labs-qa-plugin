## [0.4.0] - 2026-04-06

> **@kb-labs/qa-plugin** 0.3.0 → 0.4.0 (manual)
## [0.3.0] - 2026-04-06

> **@kb-labs/qa-plugin** 0.2.0 → 0.3.0 (manual)
## [0.2.0] - 2026-04-06

> **@kb-labs/qa-plugin** 0.1.0 → 0.2.0 (minor: new features)

### ✨ New Features

- **qa**: Updated qa-cli commands and configurations, enhancing user experience and making it easier to manage quality assurance processes.
- **general**: Introduced config-driven package discovery, streamlining the process of identifying and managing packages, which saves users time and effort.
- **qa**: Removed hardcoded check types, allowing for greater flexibility in quality checks and enabling users to customize their workflows to better fit their needs.
- **qa**: Implemented a dynamic check runner that adapts to user configurations, ensuring that quality assurance processes are more efficient and tailored to specific projects.
- **general**: Added a new --json flag to the qa:trends command, providing users with structured JSON output for better data analysis and reporting on quality trends (#2).
- **general**: Introduced a --scope flag to the qa:regressions command, allowing users to focus regression checks on specific sub-repositories or packages, enhancing the precision of quality assessments (#1).

### 🐛 Bug Fixes

- **qa-core**: Packages without an npm script are now skipped, reducing unnecessary failures and improving the overall reliability of your testing process.
- **qa-rest**: Configuration is now loaded in the run handler, allowing better control and transparency over the packages and checks being executed during QA runs.
- **qa-cli**: The skip-check flag has been normalized to an array format, ensuring consistent behavior whether you specify one or multiple packages to skip.
- **general**: Added eslint as a development dependency to qa-core, helping maintain code quality and consistency across the project.
