# SonarCloud issue inventory — garrison-hq_muster

Snapshot taken 2026-06-12 from https://sonarcloud.io/project/overview?id=garrison-hq_muster
(`api/issues/search?componentKeys=garrison-hq_muster&resolved=false` and `api/hotspots/search`).

Totals: 77 open issues, 6 security hotspots TO_REVIEW.

## Issues

| # | key | severity | type | rule | location | message |
|---|---|---|---|---|---|---|
| 1 | AZ62rt2JtmmKF0MSKCY8 | CRITICAL | BUG | typescript:S2871 | `src/core/canonical-json.ts:53` | Provide a compare function that depends on "String.localeCompare", to reliably sort elements alphabetically. |
| 2 | AZ62rt0UtmmKF0MSKCYH | CRITICAL | BUG | typescript:S2871 | `tests/unit/pipeline.test.ts:120` | Provide a compare function that depends on "String.localeCompare", to reliably sort elements alphabetically. |
| 3 | AZ62rt0UtmmKF0MSKCYI | CRITICAL | BUG | typescript:S2871 | `tests/unit/pipeline.test.ts:121` | Provide a compare function that depends on "String.localeCompare", to reliably sort elements alphabetically. |
| 4 | AZ62rt2htmmKF0MSKCZE | CRITICAL | CODE_SMELL | typescript:S3735 | `src/adapters/rfc1/index.ts:129` | Remove this use of the "void" operator. |
| 5 | AZ62rt1VtmmKF0MSKCYj | CRITICAL | CODE_SMELL | typescript:S3735 | `src/cli/index.ts:498` | Remove this use of the "void" operator. |
| 6 | AZ62rt1VtmmKF0MSKCYk | CRITICAL | CODE_SMELL | typescript:S3735 | `src/cli/index.ts:499` | Remove this use of the "void" operator. |
| 7 | AZ62rt2atmmKF0MSKCZA | CRITICAL | CODE_SMELL | typescript:S3776 | `src/adapters/rfc1/resolve.ts:102` | Refactor this function to reduce its Cognitive Complexity from 44 to the 15 allowed. |
| 8 | AZ62rt2atmmKF0MSKCZC | CRITICAL | CODE_SMELL | typescript:S3776 | `src/adapters/rfc1/resolve.ts:254` | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 9 | AZ62rt25tmmKF0MSKCZI | CRITICAL | CODE_SMELL | typescript:S3776 | `src/adapters/rfc1/state.ts:81` | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 10 | AZ62rt25tmmKF0MSKCZL | CRITICAL | CODE_SMELL | typescript:S3776 | `src/adapters/rfc1/state.ts:285` | Refactor this function to reduce its Cognitive Complexity from 42 to the 15 allowed. |
| 11 | AZ62rt1vtmmKF0MSKCYx | CRITICAL | CODE_SMELL | typescript:S3776 | `src/core/behavioral/manifest.ts:256` | Refactor this function to reduce its Cognitive Complexity from 25 to the 15 allowed. |
| 12 | AZ62rt1vtmmKF0MSKCY0 | CRITICAL | CODE_SMELL | typescript:S3776 | `src/core/behavioral/manifest.ts:339` | Refactor this function to reduce its Cognitive Complexity from 28 to the 15 allowed. |
| 13 | AZ62rt1ltmmKF0MSKCYn | CRITICAL | CODE_SMELL | typescript:S3776 | `src/core/behavioral/runner.ts:97` | Refactor this function to reduce its Cognitive Complexity from 23 to the 15 allowed. |
| 14 | AZ62rt1ltmmKF0MSKCYt | CRITICAL | CODE_SMELL | typescript:S3776 | `src/core/behavioral/runner.ts:235` | Refactor this function to reduce its Cognitive Complexity from 26 to the 15 allowed. |
| 15 | AZ62rt1ltmmKF0MSKCYu | CRITICAL | CODE_SMELL | typescript:S3776 | `src/core/behavioral/runner.ts:338` | Refactor this function to reduce its Cognitive Complexity from 21 to the 15 allowed. |
| 16 | AZ62rt14tmmKF0MSKCY3 | CRITICAL | CODE_SMELL | typescript:S3776 | `src/core/cts/manifest.ts:82` | Refactor this function to reduce its Cognitive Complexity from 25 to the 15 allowed. |
| 17 | AZ62rt0UtmmKF0MSKCYL | CRITICAL | VULNERABILITY | typescript:S5443 | `tests/unit/pipeline.test.ts:283` | Make sure publicly writable directories are used safely here. |
| 18 | AZ62rt3HtmmKF0MSKCZP | MAJOR | VULNERABILITY | githubactions:S8233 | `.github/workflows/site.yml:20` | Move this write permission from workflow level to job level. |
| 19 | AZ62rt3HtmmKF0MSKCZQ | MAJOR | VULNERABILITY | githubactions:S8233 | `.github/workflows/site.yml:21` | Move this write permission from workflow level to job level. |
| 20 | AZ62rt3HtmmKF0MSKCZN | MAJOR | VULNERABILITY | githubactions:S8264 | `.github/workflows/site.yml:19` | Move this read permission from workflow level to job level. |
| 21 | AZ62rt1ltmmKF0MSKCYs | MAJOR | CODE_SMELL | typescript:S107 | `src/core/behavioral/runner.ts:235` | Async function 'executeRun' has too many parameters (8). Maximum allowed is 7. |
| 22 | AZ62rt2ptmmKF0MSKCZG | MAJOR | CODE_SMELL | typescript:S3358 | `src/adapters/rfc1/evaluation.ts:96` | Extract this nested ternary operation into an independent statement. |
| 23 | AZ62rt1VtmmKF0MSKCYh | MAJOR | CODE_SMELL | typescript:S3358 | `src/cli/index.ts:132` | Extract this nested ternary operation into an independent statement. |
| 24 | AZ62rt1ltmmKF0MSKCYq | MAJOR | CODE_SMELL | typescript:S3358 | `src/core/behavioral/runner.ts:107` | Extract this nested ternary operation into an independent statement. |
| 25 | AZ62rt1_tmmKF0MSKCY6 | MAJOR | CODE_SMELL | typescript:S3358 | `src/core/cts/runner.ts:239` | Extract this nested ternary operation into an independent statement. |
| 26 | AZ62rt1ltmmKF0MSKCYr | MAJOR | CODE_SMELL | typescript:S4624 | `src/core/behavioral/runner.ts:107` | Refactor this code to not use nested template literals. |
| 27 | AZ62rt0wtmmKF0MSKCYT | MAJOR | CODE_SMELL | typescript:S7721 | `tests/behavioral/runner.test.ts:413` | Move function 'okResponse' to the outer scope. |
| 28 | AZ62rt0wtmmKF0MSKCYW | MAJOR | CODE_SMELL | typescript:S7721 | `tests/behavioral/runner.test.ts:539` | Move async function 'writeManifest' to the outer scope. |
| 29 | AZ62rt1VtmmKF0MSKCYl | MAJOR | CODE_SMELL | typescript:S7785 | `src/cli/index.ts:547` | Prefer top-level await over using a promise chain. |
| 30 | AZ62rt1vtmmKF0MSKCYy | MINOR | CODE_SMELL | typescript:S4325 | `src/core/behavioral/manifest.ts:284` | This assertion is unnecessary since it does not change the type of the expression. |
| 31 | AZ62rt1vtmmKF0MSKCYz | MINOR | CODE_SMELL | typescript:S4325 | `src/core/behavioral/manifest.ts:311` | This assertion is unnecessary since it does not change the type of the expression. |
| 32 | AZ62rt1vtmmKF0MSKCY1 | MINOR | CODE_SMELL | typescript:S4325 | `src/core/behavioral/manifest.ts:425` | This assertion is unnecessary since the receiver accepts the original type of the expression. |
| 33 | AZ62rt1vtmmKF0MSKCY2 | MINOR | CODE_SMELL | typescript:S4325 | `src/core/behavioral/manifest.ts:427` | This assertion is unnecessary since the receiver accepts the original type of the expression. |
| 34 | AZ62rt0wtmmKF0MSKCYS | MINOR | CODE_SMELL | typescript:S4325 | `tests/behavioral/runner.test.ts:281` | This assertion is unnecessary since it does not change the type of the expression. |
| 35 | AZ62rt1AtmmKF0MSKCYc | MINOR | CODE_SMELL | typescript:S4325 | `tests/cts/suite.test.ts:108` | This assertion is unnecessary since it does not change the type of the expression. |
| 36 | AZ62rt1AtmmKF0MSKCYd | MINOR | CODE_SMELL | typescript:S4325 | `tests/cts/suite.test.ts:108` | This assertion is unnecessary since it does not change the type of the expression. |
| 37 | AZ62rt1AtmmKF0MSKCYe | MINOR | CODE_SMELL | typescript:S4325 | `tests/cts/suite.test.ts:108` | This assertion is unnecessary since it does not change the type of the expression. |
| 38 | AZ62rt0ctmmKF0MSKCYP | MINOR | CODE_SMELL | typescript:S4325 | `tests/unit/canonical-json.test.ts:140` | This assertion is unnecessary since it does not change the type of the expression. |
| 39 | AZ62rtyDtmmKF0MSKCYA | MINOR | CODE_SMELL | typescript:S4325 | `tests/unit/cli.test.ts:400` | This assertion is unnecessary since it does not change the type of the expression. |
| 40 | AZ62rtyDtmmKF0MSKCYC | MINOR | CODE_SMELL | typescript:S4325 | `tests/unit/cli.test.ts:428` | This assertion is unnecessary since it does not change the type of the expression. |
| 41 | AZ62rtyDtmmKF0MSKCYE | MINOR | CODE_SMELL | typescript:S4325 | `tests/unit/cli.test.ts:429` | This assertion is unnecessary since it does not change the type of the expression. |
| 42 | AZ62rtyDtmmKF0MSKCYF | MINOR | CODE_SMELL | typescript:S4325 | `tests/unit/cli.test.ts:431` | This assertion is unnecessary since it does not change the type of the expression. |
| 43 | AZ62rt25tmmKF0MSKCZJ | MINOR | CODE_SMELL | typescript:S6353 | `src/adapters/rfc1/state.ts:230` | Use concise character class syntax '\w' instead of '[A-Za-z0-9_]'. |
| 44 | AZ62rt25tmmKF0MSKCZK | MINOR | CODE_SMELL | typescript:S6353 | `src/adapters/rfc1/state.ts:230` | Use concise character class syntax '\w' instead of '[A-Za-z0-9_]'. |
| 45 | AZ62rt0wtmmKF0MSKCYU | MINOR | CODE_SMELL | typescript:S6551 | `tests/behavioral/runner.test.ts:428` | 'init.body' may use Object's default stringification format ('[object Object]') when stringified. |
| 46 | AZ62rt0wtmmKF0MSKCYV | MINOR | CODE_SMELL | typescript:S6551 | `tests/behavioral/runner.test.ts:435` | 'second.body' may use Object's default stringification format ('[object Object]') when stringified. |
| 47 | AZ62rt1ltmmKF0MSKCYv | MINOR | CODE_SMELL | typescript:S7718 | `src/core/behavioral/runner.ts:451` | The catch parameter `caught` should be named `error_`. |
| 48 | AZ62rtyDtmmKF0MSKCX- | MINOR | CODE_SMELL | typescript:S7723 | `tests/unit/cli.test.ts:218` | Use `new Array()` instead of `Array()`. |
| 49 | AZ62rt1VtmmKF0MSKCYi | MINOR | CODE_SMELL | typescript:S7735 | `src/cli/index.ts:350` | Unexpected negated condition. |
| 50 | AZ62rt1LtmmKF0MSKCYf | MINOR | CODE_SMELL | typescript:S7735 | `src/cli/output.ts:17` | Unexpected negated condition. |
| 51 | AZ62rt1vtmmKF0MSKCYw | MINOR | CODE_SMELL | typescript:S7735 | `src/core/behavioral/manifest.ts:154` | Unexpected negated condition. |
| 52 | AZ62rt1ltmmKF0MSKCYo | MINOR | CODE_SMELL | typescript:S7735 | `src/core/behavioral/runner.ts:106` | Unexpected negated condition. |
| 53 | AZ62rt1ltmmKF0MSKCYp | MINOR | CODE_SMELL | typescript:S7735 | `src/core/behavioral/runner.ts:107` | Unexpected negated condition. |
| 54 | AZ62rt14tmmKF0MSKCY4 | MINOR | CODE_SMELL | typescript:S7735 | `src/core/cts/manifest.ts:148` | Unexpected negated condition. |
| 55 | AZ62rt1_tmmKF0MSKCY5 | MINOR | CODE_SMELL | typescript:S7735 | `src/core/cts/runner.ts:167` | Unexpected negated condition. |
| 56 | AZ62rt1_tmmKF0MSKCY7 | MINOR | CODE_SMELL | typescript:S7735 | `src/core/cts/runner.ts:280` | Unexpected negated condition. |
| 57 | AZ62rt0ctmmKF0MSKCYM | MINOR | CODE_SMELL | typescript:S7748 | `tests/unit/canonical-json.test.ts:32` | Don't use a zero fraction in the number. |
| 58 | AZ62rt2ptmmKF0MSKCZF | MINOR | CODE_SMELL | typescript:S7753 | `src/adapters/rfc1/evaluation.ts:59` | Use `.indexOf()` instead of `.findIndex()` when looking for the index of an item. |
| 59 | AZ62rt2wtmmKF0MSKCZH | MINOR | CODE_SMELL | typescript:S7758 | `src/adapters/rfc1/frontmatter.ts:26` | Prefer `String#codePointAt()` over `String#charCodeAt()`. |
| 60 | AZ62rt0ctmmKF0MSKCYN | MINOR | CODE_SMELL | typescript:S7773 | `tests/unit/canonical-json.test.ts:46` | Prefer `Number.NaN` over `NaN`. |
| 61 | AZ62rt0ctmmKF0MSKCYO | MINOR | CODE_SMELL | typescript:S7773 | `tests/unit/canonical-json.test.ts:49` | Prefer `Number.NaN` over `NaN`. |
| 62 | AZ62rt2atmmKF0MSKCZB | MINOR | CODE_SMELL | typescript:S7778 | `src/adapters/rfc1/resolve.ts:196` | Do not call `Array#push()` multiple times. |
| 63 | AZ62rt2atmmKF0MSKCZD | MINOR | CODE_SMELL | typescript:S7778 | `src/adapters/rfc1/resolve.ts:344` | Do not call `Array#push()` multiple times. |
| 64 | AZ62rt1LtmmKF0MSKCYg | MINOR | CODE_SMELL | typescript:S7780 | `src/cli/output.ts:98` | `String.raw` should be used to avoid escaping `\`. |
| 65 | AZ62rt05tmmKF0MSKCYZ | MINOR | CODE_SMELL | typescript:S7780 | `tests/behavioral/graders.test.ts:41` | `String.raw` should be used to avoid escaping `\`. |
| 66 | AZ62rt05tmmKF0MSKCYa | MINOR | CODE_SMELL | typescript:S7780 | `tests/behavioral/graders.test.ts:105` | `String.raw` should be used to avoid escaping `\`. |
| 67 | AZ62rt05tmmKF0MSKCYb | MINOR | CODE_SMELL | typescript:S7780 | `tests/behavioral/graders.test.ts:152` | `String.raw` should be used to avoid escaping `\`. |
| 68 | AZ62rt0wtmmKF0MSKCYX | MINOR | CODE_SMELL | typescript:S7780 | `tests/behavioral/runner.test.ts:546` | `String.raw` should be used to avoid escaping `\`. |
| 69 | AZ62rt0wtmmKF0MSKCYY | MINOR | CODE_SMELL | typescript:S7780 | `tests/behavioral/runner.test.ts:617` | `String.raw` should be used to avoid escaping `\`. |
| 70 | AZ62rt0ntmmKF0MSKCYQ | MINOR | CODE_SMELL | typescript:S7780 | `tests/unit/cts-runner.test.ts:334` | `String.raw` should be used to avoid escaping `\`. |
| 71 | AZ62rt0ntmmKF0MSKCYR | MINOR | CODE_SMELL | typescript:S7780 | `tests/unit/cts-runner.test.ts:335` | `String.raw` should be used to avoid escaping `\`. |
| 72 | AZ62rt2StmmKF0MSKCY- | MINOR | CODE_SMELL | typescript:S7781 | `src/adapters/rfc1/keyspace.ts:116` | Prefer `String#replaceAll()` over `String#replace()`. |
| 73 | AZ62rt2StmmKF0MSKCY9 | MINOR | CODE_SMELL | typescript:S7781 | `src/adapters/rfc1/keyspace.ts:116` | Prefer `String#replaceAll()` over `String#replace()`. |
| 74 | AZ62rt2StmmKF0MSKCY_ | MINOR | CODE_SMELL | typescript:S7781 | `src/adapters/rfc1/keyspace.ts:302` | Prefer `String#replaceAll()` over `String#replace()`. |
| 75 | AZ62rt0UtmmKF0MSKCYG | MINOR | CODE_SMELL | typescript:S7784 | `tests/unit/pipeline.test.ts:118` | Prefer `structuredClone(…)` over `JSON.parse(JSON.stringify(…))` to create a deep clone. |
| 76 | AZ62rt0UtmmKF0MSKCYJ | MINOR | CODE_SMELL | typescript:S7784 | `tests/unit/pipeline.test.ts:148` | Prefer `structuredClone(…)` over `JSON.parse(JSON.stringify(…))` to create a deep clone. |
| 77 | AZ62rt0UtmmKF0MSKCYK | MINOR | CODE_SMELL | typescript:S7784 | `tests/unit/pipeline.test.ts:199` | Prefer `structuredClone(…)` over `JSON.parse(JSON.stringify(…))` to create a deep clone. |

## Security hotspots (TO_REVIEW)

| # | key | category | probability | location | message |
|---|---|---|---|---|---|
| 1 | AZ62rt1ctmmKF0MSKCYm | dos | MEDIUM | `src/core/behavioral/client.ts:67` | Make sure the regex used here, which is vulnerable to super-linear runtime due to backtracking, cannot lead to denial of service. |
| 2 | AZ62rtyDtmmKF0MSKCX_ | dos | MEDIUM | `tests/unit/cli.test.ts:331` | Make sure the regex used here, which is vulnerable to super-linear runtime due to backtracking, cannot lead to denial of service. |
| 3 | AZ62rtyDtmmKF0MSKCYB | encrypt-data | LOW | `tests/unit/cli.test.ts:418` | Using http protocol is insecure. Use https instead. |
| 4 | AZ62rtyDtmmKF0MSKCYD | encrypt-data | LOW | `tests/unit/cli.test.ts:428` | Using http protocol is insecure. Use https instead. |
| 5 | AZ62rt3AtmmKF0MSKCZM | others | LOW | `.github/workflows/ci.yml:24` | Use full commit SHA hash for this dependency. |
| 6 | AZ62rt3HtmmKF0MSKCZO | others | LOW | `.github/workflows/site.yml:35` | Use full commit SHA hash for this dependency. |
